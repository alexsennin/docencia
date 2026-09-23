import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const teacherSessionCookie = "docencia_teacher_session";
export const teacherSessionMaxAge = 8 * 60 * 60;

export function teacherAuthConfigured() {
  return Boolean(process.env.TEACHER_PASSWORD && process.env.TEACHER_SESSION_SECRET);
}

export function teacherPasswordMatches(candidate: string) {
  const expected = process.env.TEACHER_PASSWORD;
  if (!expected) return false;
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

export function createTeacherSession() {
  const secret = process.env.TEACHER_SESSION_SECRET;
  if (!secret) throw new Error("Falta configurar la sesión docente.");
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + teacherSessionMaxAge * 1000,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyTeacherSession(token?: string) {
  const secret = process.env.TEACHER_SESSION_SECRET;
  if (!secret || !token || token.length > 1024) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { expiresAt?: number; nonce?: string };
    return Number.isSafeInteger(data.expiresAt) &&
      (data.expiresAt as number) > Date.now() &&
      (data.expiresAt as number) <= Date.now() + teacherSessionMaxAge * 1000 &&
      typeof data.nonce === "string";
  } catch {
    return false;
  }
}

export async function hasTeacherSession() {
  const token = (await cookies()).get(teacherSessionCookie)?.value;
  return verifyTeacherSession(token);
}
