import { getDataBackend } from "../../../../lib/data-backend";
import { ExamWorkflowError, recordExamEventInPostgres } from "../../../../lib/exam-attempt-postgres";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (getDataBackend() === "postgres") return Response.json(await recordExamEventInPostgres(payload as Parameters<typeof recordExamEventInPostgres>[0]));
    if (hasSheetsBridge()) await sheetsBridge("examEvent", payload);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el evento.", status: error instanceof ExamWorkflowError ? error.status : 500 }, { status: error instanceof ExamWorkflowError ? error.status : 500 });
  }
}
