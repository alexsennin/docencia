import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import { getTeacherExamResultsInPostgres } from "../../../../lib/exam-attempt-postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const backend = getDataBackend();
    if (backend === "postgres") return Response.json(await getTeacherExamResultsInPostgres(), { headers: { "Cache-Control": "no-store" } });
    if (!hasSheetsBridge()) return Response.json({ error: "No está configurada la conexión con Google Sheets." }, { status: 503 });
    const data = await sheetsBridge<Record<string, unknown>>("listExamResults", {});
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar el reporte." }, { status: 502 }); }
}
