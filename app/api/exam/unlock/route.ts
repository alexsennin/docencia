import { getDataBackend } from "../../../../lib/data-backend";
import { ExamWorkflowError, unlockExamAttemptInPostgres } from "../../../../lib/exam-attempt-postgres";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { attemptId?: string; password?: string };
    if (!payload.attemptId || !payload.password) return Response.json({ error: "Captura la contraseña de desbloqueo." }, { status: 400 });
    if (getDataBackend() === "postgres") return Response.json(await unlockExamAttemptInPostgres(payload));
    if (hasSheetsBridge()) return Response.json(await sheetsBridge("unlockAttempt", payload));
    const configuredPassword = process.env.EXAM_UNLOCK_PASSWORD;
    if (!configuredPassword) return Response.json({ error: "Falta configurar la contraseña de desbloqueo en el servidor." }, { status: 503 });
    if (payload.password !== configuredPassword) return Response.json({ error: "Contraseña incorrecta." }, { status: 401 });
    return Response.json({ ok: true, unlockedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo desbloquear el intento.", status: error instanceof ExamWorkflowError ? error.status : 500 }, { status: error instanceof ExamWorkflowError ? error.status : 500 });
  }
}
