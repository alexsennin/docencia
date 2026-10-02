import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import { advanceCaRubricJobPostgres, getCaRubricJobPostgres, startCaRubricJobPostgres } from "../../../../lib/ca-rubric-postgres";

export const dynamic = "force-dynamic";

async function allowed() {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (getDataBackend() === "sheets" && !hasSheetsBridge()) return Response.json({ error: "No está configurada la conexión con Google Sheets." }, { status: 503 });
  return null;
}

export async function GET(request: Request) {
  const denied = await allowed();
  if (denied) return denied;
  try {
    const backend = getDataBackend();
    const partialId = new URL(request.url).searchParams.get("partialId") ?? undefined;
    const job = backend === "postgres" ? await getCaRubricJobPostgres(partialId) : await sheetsBridge("getCaRubricJob", {});
    return Response.json({ job, backend }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar el proceso." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const denied = await allowed();
  if (denied) return denied;
  try {
    const body = await request.json() as { action?: string; partialId?: string; grade?: string; group?: string; jobId?: string };
    const backend = getDataBackend();
    const job = backend === "postgres"
      ? body.action === "advance"
        ? await advanceCaRubricJobPostgres(String(body.jobId ?? ""))
        : await startCaRubricJobPostgres({ partialId: body.partialId, group: body.group })
      : await sheetsBridge("startCaRubricJob", { partialId: body.partialId, group: body.group, autoSave: true });
    return Response.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo iniciar la generación." }, { status: 502 });
  }
}
