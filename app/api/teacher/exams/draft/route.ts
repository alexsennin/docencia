import mammoth from "mammoth";
import { getDataBackend } from "../../../../../lib/data-backend";
import { buildExamDraftInPostgres, ExamAuthoringError, publishExamDraftInPostgres, saveExamDraftInPostgres } from "../../../../../lib/exam-authoring-postgres";
import { hasSheetsBridge, sheetsBridge } from "../../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../../lib/teacher-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const maxDocxBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const backend = getDataBackend();
    if (backend === "sheets" && !hasSheetsBridge()) return Response.json({ error: "La conexión con Apps Script no está configurada." }, { status: 503 });
    const form = await request.formData();
    const examFile = form.get("examFile");
    const guideFile = form.get("guideFile");
    if (!(examFile instanceof File) || !(guideFile instanceof File)) return Response.json({ error: "Carga el examen y la guía docente en formato .docx." }, { status: 400 });
    for (const file of [examFile, guideFile]) {
      if (!file.name.toLowerCase().endsWith(".docx") || file.size > maxDocxBytes || file.size === 0) return Response.json({ error: "Cada archivo debe ser .docx, no vacío y menor de 10 MB." }, { status: 400 });
    }
    const [examResult, guideResult] = await Promise.all([
      mammoth.extractRawText({ buffer: Buffer.from(await examFile.arrayBuffer()) }),
      mammoth.extractRawText({ buffer: Buffer.from(await guideFile.arrayBuffer()) }),
    ]);
    const examText = examResult.value.trim();
    const guideText = guideResult.value.trim();
    if (examText.length < 80 || guideText.length < 40) return Response.json({ error: "No se pudo extraer suficiente texto. Verifica que ambos Word contengan texto seleccionable." }, { status: 422 });
    const payload = {
      examText, guideText, partialId: String(form.get("partialId") || ""),
      grade: String(form.get("grade") || ""), group: String(form.get("group") || "TODOS"),
    };
    if (backend === "postgres") {
      const draft = await buildExamDraftInPostgres(payload);
      return Response.json({ draft }, { headers: { "Cache-Control": "no-store" } });
    }
    const draft = await sheetsBridge<Record<string, unknown>>("buildExamDraft", payload);
    return Response.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ExamAuthoringError ? error.status : 502;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo generar el borrador del examen." }, { status });
  }
}

export async function PATCH(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const backend = getDataBackend();
    if (backend === "sheets" && !hasSheetsBridge()) return Response.json({ error: "La conexión con Apps Script no está configurada." }, { status: 503 });
    const body = await request.json() as { action?: string; draft?: Record<string, unknown>; sourceExamId?: string; examId?: string };
    if (body.action === "save" && body.draft) {
      if (backend === "postgres") {
        const result = await saveExamDraftInPostgres({ draft: body.draft, sourceExamId: body.sourceExamId });
        return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
      }
      const result = await sheetsBridge<Record<string, unknown>>("saveExamDraft", { draft: body.draft, sourceExamId: body.sourceExamId || "" });
      return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "publish" && body.examId) {
      if (backend === "postgres") {
        const result = await publishExamDraftInPostgres(body.examId);
        return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
      }
      const result = await sheetsBridge<Record<string, unknown>>("publishExamDraft", { examId: body.examId });
      return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Acción de revisión no válida." }, { status: 400 });
  } catch (error) {
    const status = error instanceof ExamAuthoringError ? error.status : 502;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la revisión." }, { status });
  }
}
