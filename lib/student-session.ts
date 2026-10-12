import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDatabase } from "../db/client.ts";
import { studentSessions, students } from "../db/schema.ts";

export const studentSessionCookie = "docencia_student_session";
export const studentSessionMaxAge = 8 * 60 * 60;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createStudentSession(studentId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await getDatabase().insert(studentSessions).values({
    id: `student-session-${randomUUID()}`, studentId, tokenHash: hashToken(token),
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + studentSessionMaxAge * 1000).toISOString(),
  });
  return token;
}

export async function getStudentSession() {
  const token = (await cookies()).get(studentSessionCookie)?.value;
  if (!token || token.length > 128) return null;
  const now = new Date().toISOString();
  const [session] = await getDatabase().select({ studentId: studentSessions.studentId, active: students.active })
    .from(studentSessions).innerJoin(students, eq(students.id, studentSessions.studentId))
    .where(and(eq(studentSessions.tokenHash, hashToken(token)), isNull(studentSessions.revokedAt), gt(studentSessions.expiresAt, now)))
    .limit(1);
  return session?.active ? { studentId: session.studentId } : null;
}

export async function requireStudentId(requestedId?: unknown) {
  const session = await getStudentSession();
  if (!session) return null;
  if (requestedId !== undefined && String(requestedId).trim().toUpperCase() !== session.studentId.trim().toUpperCase()) return null;
  return session.studentId;
}

export async function revokeStudentSession() {
  const token = (await cookies()).get(studentSessionCookie)?.value;
  if (!token) return;
  await getDatabase().update(studentSessions).set({ revokedAt: new Date().toISOString() })
    .where(eq(studentSessions.tokenHash, hashToken(token)));
}
