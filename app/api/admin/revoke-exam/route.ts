import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Inicia sesión como docente." }, { status: 401 });
  try {
    const payload = await request.json() as { studentId?: string; examId?: string };
    if (!payload.studentId?.trim() || !payload.examId?.trim()) {
      return Response.json({ error: "Alumno y examen son obligatorios." }, { status: 400 });
    }
    if (!hasSheetsBridge()) return Response.json({ error: "La administración requiere el puente seguro con Google Sheets." }, { status: 503 });
    const result = await sheetsBridge("revokeExam", {
      studentId: payload.studentId.trim(),
      examId: payload.examId.trim(),
    });
    return Response.json({ result, source: "sheets" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo revocar el examen." }, { status: 500 });
  }
}
