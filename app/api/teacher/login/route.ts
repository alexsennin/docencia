import { NextResponse } from "next/server";
import { createTeacherSession, teacherAuthConfigured, teacherPasswordMatches, teacherSessionCookie, teacherSessionMaxAge } from "../../../../lib/teacher-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!teacherAuthConfigured()) return NextResponse.json({ error: "El acceso docente aún no está configurado." }, { status: 503 });
  let payload: { password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Captura la contraseña." }, { status: 400 });
  }
  if (typeof payload.password !== "string" || !teacherPasswordMatches(payload.password)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(teacherSessionCookie, createTeacherSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: teacherSessionMaxAge,
  });
  return response;
}
