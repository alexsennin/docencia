import { getDataBackend } from "../../../../lib/data-backend";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { approveAssessmentTemplateInPostgres, deleteAssessmentTemplateDraftInPostgres, getAssessmentTemplateInPostgres, listAssessmentTemplatesInPostgres, saveAssessmentTemplateInPostgres, updateAssessmentTemplatePolicyInPostgres, type AssessmentKind } from "../../../../lib/assessment-templates-postgres";
import { ExamAuthoringError } from "../../../../lib/exam-authoring-postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function gate() {
  if (getDataBackend() !== "postgres") return Response.json({ error: "Los repositorios de evaluaciones requieren PostgreSQL." }, { status: 503 });
  return null;
}
function fail(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "No se pudo completar la operación." },
    { status: error instanceof ExamAuthoringError ? error.status : 500 });
}

export async function GET(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  const unavailable = gate(); if (unavailable) return unavailable;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const result = id ? await getAssessmentTemplateInPostgres(id)
      : await listAssessmentTemplatesInPostgres(url.searchParams.get("kind") as AssessmentKind);
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  const unavailable = gate(); if (unavailable) return unavailable;
  try {
    const result = await saveAssessmentTemplateInPostgres(await request.json());
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  const unavailable = gate(); if (unavailable) return unavailable;
  try {
    const body = await request.json() as {
      action?: string;
      templateId?: string;
      examId?: string;
      timeMode?: unknown;
      durationMinutes?: unknown;
      lockOnFocusLoss?: unknown;
    };
    const result = body.action === "updatePolicy" || body.timeMode !== undefined
      ? await updateAssessmentTemplatePolicyInPostgres(body)
      : await approveAssessmentTemplateInPostgres(String(body.templateId ?? ""));
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function DELETE(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  const unavailable = gate(); if (unavailable) return unavailable;
  try {
    const url = new URL(request.url);
    let templateId = url.searchParams.get("id") || "";
    if (!templateId) {
      const body = await request.json().catch(() => ({})) as { templateId?: string };
      templateId = String(body.templateId ?? "");
    }
    const result = await deleteAssessmentTemplateDraftInPostgres(templateId);
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
