import { demoExams, demoStudents } from "../../../../lib/demo-exams";
import { toPublicExam } from "../../../../lib/exam-engine";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import type { PublicExam, Student } from "../../../../lib/exam-types";
import { getDataBackend } from "../../../../lib/data-backend";
import { lookupStudentInPostgres } from "../../../../lib/student-access";
import { createStudentSession, studentSessionCookie, studentSessionMaxAge } from "../../../../lib/student-session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { studentId?: string };
    const studentId = body.studentId?.trim();
    if (!studentId) return Response.json({ error: "Escribe tu ID escolar." }, { status: 400 });
    if (getDataBackend() === "postgres") {
      const data = await lookupStudentInPostgres(studentId);
      const response = NextResponse.json({ ...data, source: "postgres" }, { headers: { "Cache-Control": "no-store" } });
      response.cookies.set(studentSessionCookie, await createStudentSession(data.student.id), {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: studentSessionMaxAge,
      });
      return response;
    }
    if (hasSheetsBridge()) {
      const data = await sheetsBridge<{ student: Student; exams: PublicExam[] }>("lookupStudent", { studentId });
      return Response.json({ ...data, source: "sheets" });
    }
    const student = demoStudents.find((item) => item.id.toUpperCase() === studentId.toUpperCase());
    if (!student) return Response.json({ error: "No se encontró el ID. La previa usa DEMO-1, DEMO-2 o DEMO-3 mientras se conecta Google Sheets." }, { status: 404 });
    const exams = demoExams.filter((exam) => exam.status === "Publicado" && exam.grade === student.grade && (exam.group === "TODOS" || exam.group === student.group)).map(toPublicExam);
    return Response.json({ student, exams, source: "demo" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo validar el ID." }, { status: 500 });
  }
}
