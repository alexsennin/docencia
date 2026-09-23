import { NextResponse } from "next/server";
import { hasSheetsBridge, sheetsBridge } from "../../../lib/sheets-bridge";
import { createTeacherSession, teacherAuthConfigured, teacherPasswordMatches, teacherSessionCookie, teacherSessionMaxAge } from "../../../lib/teacher-auth";
import type { PublicExam, Student } from "../../../lib/exam-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { credential?: unknown };
    const credential = typeof body.credential === "string" ? body.credential.trim() : "";
    if (!credential || credential.length > 128) return NextResponse.json({ error: "Escribe tu ID o contraseña docente." }, { status: 400 });
    if (teacherAuthConfigured() && teacherPasswordMatches(credential)) {
      const response = NextResponse.json({ role: "teacher" }, { headers: { "Cache-Control": "no-store" } });
      response.cookies.set(teacherSessionCookie, createTeacherSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: teacherSessionMaxAge });
      return response;
    }
    if (!hasSheetsBridge()) return NextResponse.json({ error: "El acceso escolar aún no está disponible." }, { status: 503 });
    const data = await sheetsBridge<{ student: Student; exams: PublicExam[] }>("lookupStudent", { studentId: credential });
    return NextResponse.json({ role: "student", ...data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const missingStudent = error instanceof Error && /No se encontr[oó] el ID escolar/i.test(error.message);
    return NextResponse.json({ error: missingStudent ? "No se encontró el ID o la contraseña es incorrecta." : "No se pudo consultar Google Sheets. Intenta de nuevo en unos momentos." }, { status: missingStudent ? 401 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
