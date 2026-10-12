import { getDataBackend } from "../../../../lib/data-backend";
import { finalizeExpiredAssessmentAttemptsInPostgres } from "../../../../lib/exam-attempt-postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (getDataBackend() !== "postgres") return Response.json({ error: "PostgreSQL requerido." }, { status: 503 });
  try {
    return Response.json(await finalizeExpiredAssessmentAttemptsInPostgres(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No se pudo cerrar el lote vencido." }, { status: 502 });
  }
}
