import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import { getTeacherExamResultsInPostgres } from "../../../../lib/exam-attempt-postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const backend = getDataBackend();
    if (backend === "postgres") {
      const params = new URL(request.url).searchParams;
      return Response.json(await getTeacherExamResultsInPostgres({
        includeInProgress: params.get("includeInProgress") === "true",
        kind: params.get("kind") === "Actividad" ? "Actividad" : "Examen",
      }), { headers: { "Cache-Control": "no-store" } });
    }
    if (new URL(request.url).searchParams.get("kind") === "Actividad") {
      return Response.json({ error: "La matriz de trabajos con evaluación requiere PostgreSQL." }, { status: 503 });
    }
    if (!hasSheetsBridge()) return Response.json({ error: "No está configurada la conexión con Google Sheets." }, { status: 503 });
    const data = await sheetsBridge<Record<string, unknown>>("listExamResults", {});
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar el reporte." }, { status: 502 }); }
}
