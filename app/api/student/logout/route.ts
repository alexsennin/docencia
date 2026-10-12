import { NextResponse } from "next/server";
import { getDataBackend } from "../../../../lib/data-backend";
import { revokeStudentSession, studentSessionCookie } from "../../../../lib/student-session";

export const runtime = "nodejs";

export async function POST() {
  if (getDataBackend() === "postgres") await revokeStudentSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(studentSessionCookie);
  return response;
}
