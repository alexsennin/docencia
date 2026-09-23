import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { studentId?: string; examId?: string; password?: string };
    if (!payload.studentId?.trim() || !payload.examId?.trim() || !payload.password) {
      return Response.json({ error: "Alumno, examen y contraseña docente son obligatorios." }, { status: 400 });
    }
    if (!hasSheetsBridge()) return Response.json({ error: "La administración requiere el puente seguro con Google Sheets." }, { status: 503 });
    const result = await sheetsBridge("revokeExam", {
      studentId: payload.studentId.trim(),
      examId: payload.examId.trim(),
      password: payload.password,
    });
    return Response.json({ result, source: "sheets" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo revocar el examen." }, { status: 500 });
  }
}
