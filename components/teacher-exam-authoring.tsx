"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ProgressOverlay } from "./progress-overlay";

type DraftQuestion = { order: number; topic: string; type: string; prompt: string; options: string[]; correctAnswer: string | string[] | null; maxScore: number; evaluationMethod: string; rubric: Record<string, unknown> | null; sourceMatch: boolean };
type Draft = { name: string; instructions: string; questions: DraftQuestion[]; reviewNotes: string[]; partialId: string; grade: string; group: string; provider: string; model: string; sourceExamId?: string };
type Row = Record<string, string | number | boolean | null | undefined>;

export function TeacherExamAuthoring({ active, partialId }: { active: boolean; partialId: string }) {
  const [exams, setExams] = useState<Row[]>([]);
  const [grade, setGrade] = useState("1°");
  const [group, setGroup] = useState("TODOS");
  const [sourceExamId, setSourceExamId] = useState("");
  const [draftText, setDraftText] = useState("");
  const [savedDraftText, setSavedDraftText] = useState("");
  const [examId, setExamId] = useState("");
  const [busy, setBusy] = useState("Consultando exámenes…");
  const [busyDetail, setBusyDetail] = useState("Cargamos las opciones disponibles para construir un nuevo examen.");
  const [configLoaded, setConfigLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const remoteActionInFlight = useRef(false);

  useEffect(() => {
    if (!active || configLoaded) return;
    let cancelled = false;
    fetch("/api/teacher/academic", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { snapshot?: { exams: Row[] }; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la configuración.");
      if (!cancelled && data.snapshot) setExams(data.snapshot.exams);
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo cargar la configuración."); }).finally(() => { if (!cancelled) { setConfigLoaded(true); setBusy(""); } });
    return () => { cancelled = true; };
  }, [active, configLoaded]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (remoteActionInFlight.current) return;
    remoteActionInFlight.current = true;
    const form = new FormData(event.currentTarget);
    setBusy("Analizando el examen y la guía con Gemini…"); setBusyDetail("Apps Script analiza los documentos y prepara un borrador para revisión docente."); setError(""); setMessage(""); setExamId(""); setSavedDraftText("");
    try {
      form.set("partialId", partialId); form.set("grade", grade); form.set("group", group);
      const response = await fetch("/api/teacher/exams/draft", { method: "POST", body: form });
      const data = await response.json() as { draft?: Draft; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error || "No se generó el borrador.");
      data.draft.sourceExamId = sourceExamId;
      setDraftText(JSON.stringify(data.draft, null, 2));
      setMessage("Borrador generado. Revisa consignas, respuestas, rubricas y puntajes antes de guardarlo.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo generar el borrador."); }
    finally { remoteActionInFlight.current = false; setBusy(""); }
  }

  async function review(action: "save" | "publish") {
    if (remoteActionInFlight.current) return;
    remoteActionInFlight.current = true;
    setBusy(action === "save" ? "Guardando borrador…" : "Publicando examen revisado…"); setBusyDetail(action === "save" ? "Guardamos una versión nueva sin reemplazar intentos previos." : "Verificamos la revisión y hacemos visible el examen para el grupo seleccionado."); setError(""); setMessage("");
    try {
      let body: Record<string, unknown>;
      if (action === "save") {
        const draft = JSON.parse(draftText) as Draft;
        draft.sourceExamId = sourceExamId || examId || "";
        body = { action, draft, sourceExamId: draft.sourceExamId };
      } else {
        if (!examId) throw new Error("Primero guarda el examen como borrador.");
        if (draftText !== savedDraftText) throw new Error("Hay cambios sin guardar. Guárdalos como una nueva versión antes de publicar.");
        body = { action, examId };
      }
      const response = await fetch("/api/teacher/exams/draft", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { result?: { examId?: string; status?: string; version?: number }; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "No se completó la revisión.");
      if (action === "save") { setExamId(data.result.examId || ""); setSourceExamId(data.result.examId || ""); setSavedDraftText(draftText); }
      setMessage(action === "save" ? `Borrador guardado (${data.result.examId}, versión ${data.result.version}). No es visible para alumnos hasta publicarlo.` : "Examen publicado y disponible para el grado, grupo y parcial seleccionados.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se completó la revisión."); }
    finally { remoteActionInFlight.current = false; setBusy(""); }
  }

  let draft: Draft | null = null;
  try { if (draftText) draft = JSON.parse(draftText) as Draft; } catch { /* se valida al guardar */ }
  const draftUsesCurrentPartial = !draft || draft.partialId === partialId;

  return <section className="admin-controls exam-authoring" aria-labelledby="exam-authoring-title">
    <div className="section-heading"><div><p className="eyebrow">DISEÑO Y EVALUACIÓN</p><h2 id="exam-authoring-title">Constructor de exámenes</h2></div><span className="admin-control-badge">Revisión obligatoria</span></div>
    <p className="admin-control-description">Carga el examen definitivo y la guía docente con rúbrica. Gemini propone la estructura; ningún borrador se publica automáticamente.</p>
    <form className="authoring-form" onSubmit={generate}>
      <div className="authoring-selects"><label className="select-field"><span>Grado</span><select value={grade} onChange={(event) => setGrade(event.target.value)}><option>1°</option><option>2°</option><option>3°</option></select></label><label className="select-field"><span>Grupo</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option>TODOS</option><option>A</option><option>B</option></select></label></div>
      <label className="select-field"><span>Crear versión basada en examen anterior (opcional)</span><select value={sourceExamId} onChange={(event) => setSourceExamId(event.target.value)}><option value="">Nuevo examen · versión 1</option>{exams.filter((item) => String(item.parcial_id) === partialId).map((item) => <option key={String(item.examen_id)} value={String(item.examen_id)}>{String(item.nombre)} · {String(item.grado)} · {String(item.estado)}</option>)}</select></label>
      <div className="authoring-files"><label><span>Examen definitivo (.docx)</span><input name="examFile" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label><label><span>Guía docente y rúbrica (.docx)</span><input name="guideFile" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label></div>
      <button className="primary-button" type="submit" disabled={!!busy || !partialId}>Generar borrador para revisión</button>
    </form>
    {draftText && <div className="draft-review"><div className="draft-review-heading"><div><strong>{draft?.name || "Borrador de examen"}</strong><span>{draft?.questions.length ?? 0} reactivos · suma esperada 100 puntos · 50 minutos</span></div>{examId && <span className="admin-control-badge">Borrador guardado</span>}</div>
      {!!draft?.reviewNotes?.length && <div className="draft-warnings"><strong>Revisión necesaria</strong>{draft.reviewNotes.map((note, index) => <span key={`${index}-${note}`}>• {note}</span>)}</div>}
      <label className="select-field"><span>Revisa y edita el JSON completo. Verifica literalmente cada consigna con el Word, clave y rúbrica.</span><textarea className="draft-json" value={draftText} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} /></label>
      {examId && draftText !== savedDraftText && <p className="notice">Hay cambios sin guardar. Guarda una nueva versión antes de publicar; la versión anterior no se modifica.</p>}
      {!draftUsesCurrentPartial && <p className="notice">Este borrador pertenece a otro parcial. Selecciona su parcial en el selector superior para continuar.</p>}
      <div className="gemini-actions"><button className="secondary-button" type="button" onClick={() => void review("save")} disabled={!!busy || !draft}>Guardar como borrador</button><button className="primary-button" type="button" onClick={() => void review("publish")} disabled={!!busy || !examId || draftText !== savedDraftText || !draftUsesCurrentPartial}>Aprobar y publicar</button></div>
    </div>}
    {message && <p className="admin-control-message gemini-success" role="status">{message}</p>}{error && <p className="notice" role="alert">{error}</p>}{busy && <ProgressOverlay title={busy} detail={busyDetail} />}
  </section>;
}
