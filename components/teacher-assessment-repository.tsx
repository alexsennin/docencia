"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ProgressOverlay } from "./progress-overlay";
import { TeacherAssessmentGuide } from "./teacher-assessment-guide";

type Kind = "Examen" | "Actividad";
type Template = { id: string; name: string; kind: Kind; version: number; status: string; grade: string | null; timeMode: string; durationMinutes: number | null; lockOnFocusLoss: boolean };
type Group = { id: string; name: string; studentGrade: string; section: string; active: boolean; studentCount: number };
type DraftQuestion = { order?: number; topic?: string; type?: string; prompt?: string; options?: string[]; correctAnswer?: unknown; maxScore?: number; evaluationMethod?: string; rubric?: { criteria?: string[]; levels?: Array<{ name?: string; score?: number; description?: string }> } | null };
type Draft = { name: string; instructions: string; questions: DraftQuestion[]; grade: string; partialId?: string };
type SavedTemplate = Template & { instructions: string; questions: Array<{ order: number; topic: string | null; type: string; prompt: string; options: unknown; correctAnswer: unknown; maxScore: string; evaluationMethod: string; rubric: string | null }> };

export function TeacherAssessmentRepository({ active, partialId }: { active: boolean; partialId: string }) {
  const [kind, setKind] = useState<Kind>("Examen");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grade, setGrade] = useState("1°");
  const [timeMode, setTimeMode] = useState<"Estricto" | "Libre">("Estricto");
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [lockOnFocusLoss, setLockOnFocusLoss] = useState(true);
  const [sourceTemplateId, setSourceTemplateId] = useState("");
  const [draftText, setDraftText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [savedId, setSavedId] = useState("");
  const [savedPolicyText, setSavedPolicyText] = useState("");
  const [editingPolicyId, setEditingPolicyId] = useState("");
  const [editTimeMode, setEditTimeMode] = useState<"Estricto" | "Libre">("Estricto");
  const [editDurationMinutes, setEditDurationMinutes] = useState(50);
  const [editLockOnFocusLoss, setEditLockOnFocusLoss] = useState(true);
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadedKind, setLoadedKind] = useState<Kind | null>(null);
  const inFlight = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const saveSignature = JSON.stringify([draftText, timeMode, durationMinutes, lockOnFocusLoss]);
  const currentPolicySignature = JSON.stringify([timeMode, timeMode === "Libre" ? null : durationMinutes, lockOnFocusLoss]);

  useEffect(() => {
    if (!active || loadedKind === kind) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return null;
      setBusy("Consultando repositorio…"); setDetail(`Cargamos ${kind === "Examen" ? "exámenes" : "actividades"} y grupos disponibles.`);
      return Promise.all([
        fetch(`/api/teacher/assessments?kind=${kind}`, { cache: "no-store" }),
        fetch("/api/teacher/students", { cache: "no-store" }),
      ]);
    }).then(async (responses) => {
      if (!responses) return;
      const [templatesResponse, groupsResponse] = responses;
      const [items, registry] = await Promise.all([templatesResponse.json(), groupsResponse.json()]);
      if (!templatesResponse.ok || !groupsResponse.ok) throw new Error(items.error || registry.error || "No se pudo cargar el repositorio.");
      if (!cancelled) { setTemplates(items.result); setGroups(registry.groups); setLoadedKind(kind); }
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo cargar el repositorio."); })
      .finally(() => { if (!cancelled) setBusy(""); });
    return () => { cancelled = true; };
  }, [active, kind, loadedKind]);

  async function call(url: string, method: "POST" | "PATCH", body: unknown) {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se completó la operación.");
    return data.result;
  }

  async function reloadRepository() {
    const [templatesResponse, groupsResponse] = await Promise.all([
      fetch(`/api/teacher/assessments?kind=${kind}`, { cache: "no-store" }),
      fetch("/api/teacher/students", { cache: "no-store" }),
    ]);
    const [items, registry] = await Promise.all([templatesResponse.json(), groupsResponse.json()]);
    if (!templatesResponse.ok || !groupsResponse.ok) throw new Error(items.error || registry.error || "No se pudo actualizar el repositorio.");
    setTemplates(items.result); setGroups(registry.groups); setLoadedKind(kind);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy("Analizando documentos con Gemini…"); setDetail("Generamos reactivos y rúbricas para que los revises antes de guardarlos."); setError(""); setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      form.set("partialId", partialId); form.set("grade", grade); form.set("group", "TODOS");
      const response = await fetch("/api/teacher/exams/draft", { method: "POST", body: form });
      const data = await response.json() as { draft?: Draft; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error || "No se generó el borrador.");
      setDraftText(JSON.stringify(data.draft, null, 2)); setSavedText(""); setSavedId(""); setSavedPolicyText("");
      setMessage("Borrador generado. Revisa preguntas, respuestas y rúbricas antes de guardarlo.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo generar el borrador."); }
    finally { inFlight.current = false; setBusy(""); }
  }

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("Guardando versión…"); setDetail("Guardamos el contenido en el repositorio seleccionado; todavía no queda asignado a alumnos."); setError(""); setMessage("");
    try {
      const draft = JSON.parse(draftText);
      const result = await call("/api/teacher/assessments", "POST", { kind, draft, sourceTemplateId, timeMode, durationMinutes, lockOnFocusLoss });
      const confirmation = await fetch(`/api/teacher/assessments?id=${encodeURIComponent(result.templateId)}`, { cache: "no-store" });
      const persisted = await confirmation.json() as { result?: SavedTemplate; error?: string };
      if (!confirmation.ok || persisted.result?.id !== result.templateId || persisted.result?.questions.length !== draft.questions.length) {
        throw new Error(`El servidor recibió el borrador ${result.templateId}, pero no pudo confirmar su lectura. Reabre el repositorio antes de intentar guardarlo de nuevo.`);
      }
      setSavedId(result.templateId); setSavedText(saveSignature); setSavedPolicyText(currentPolicySignature); setSourceTemplateId(result.templateId);
      setTemplates((current) => [...current, { id: result.templateId, name: String(draft.name), kind, version: result.version, status: "Borrador", grade, timeMode, durationMinutes: timeMode === "Libre" ? null : durationMinutes, lockOnFocusLoss }]);
      setMessage(`${kind} guardado como borrador v${result.version}. Ya puedes abrirlo en Espacio de Pruebas; apruébalo cuando esté listo para asignar.`);
      try { await reloadRepository(); }
      catch { setError("La versión quedó guardada, pero la lista no se actualizó. Vuelve a abrir el repositorio para consultarla."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la versión."); }
    finally { inFlight.current = false; setBusy(""); }
  }

  async function openSaved(templateId: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("Abriendo borrador guardado…"); setDetail("Recuperamos sus preguntas y ajustes del repositorio."); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/teacher/assessments?id=${encodeURIComponent(templateId)}`, { cache: "no-store" });
      const data = await response.json() as { result?: SavedTemplate; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "No se pudo abrir el borrador.");
      const item = data.result;
      const draft = { name: item.name, instructions: item.instructions, grade: item.grade,
        group: "TODOS", questions: item.questions.map((question) => ({
          order: question.order, topic: question.topic || "Español", type: question.type,
          prompt: question.prompt, options: question.options, correctAnswer: question.correctAnswer,
          maxScore: Number(question.maxScore), evaluationMethod: question.evaluationMethod,
          rubric: question.rubric ? JSON.parse(question.rubric) : null,
        })) };
      const text = JSON.stringify(draft, null, 2);
      const nextTimeMode = item.timeMode === "Libre" ? "Libre" : "Estricto";
      const nextDuration = item.durationMinutes || 50;
      setDraftText(text); setGrade(item.grade || "1°"); setTimeMode(nextTimeMode);
      setDurationMinutes(nextDuration); setLockOnFocusLoss(item.lockOnFocusLoss);
      setSourceTemplateId(item.id); setSavedId(item.id);
      setSavedText(JSON.stringify([text, nextTimeMode, nextDuration, item.lockOnFocusLoss]));
      setSavedPolicyText(JSON.stringify([nextTimeMode, nextTimeMode === "Libre" ? null : nextDuration, item.lockOnFocusLoss]));
      setMessage(`${item.name} · v${item.version} recuperado. Puedes actualizar su tiempo y bloqueo de pantalla directamente, o editar reactivos y guardar una versión nueva.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo abrir el borrador."); }
    finally { inFlight.current = false; setBusy(""); }
  }

  function startEditingPolicy(item: Template) {
    setEditingPolicyId(item.id);
    setEditTimeMode(item.timeMode === "Libre" ? "Libre" : "Estricto");
    setEditDurationMinutes(item.durationMinutes || 50);
    setEditLockOnFocusLoss(item.lockOnFocusLoss);
  }

  async function savePolicy(targetTemplateId: string, nextTimeMode: "Estricto" | "Libre", nextDurationMinutes: number, nextLockOnFocusLoss: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("Actualizando tiempo y bloqueo…");
    setDetail("Guardamos los nuevos ajustes de tiempo y bloqueo de pantalla en la actividad y sus asignaciones activas.");
    setError("");
    setMessage("");
    try {
      const normalizedDuration = nextTimeMode === "Libre" ? null : nextDurationMinutes;
      await call("/api/teacher/assessments", "PATCH", {
        action: "updatePolicy",
        templateId: targetTemplateId,
        timeMode: nextTimeMode,
        durationMinutes: normalizedDuration,
        lockOnFocusLoss: nextLockOnFocusLoss,
      });
      setTemplates((current) => current.map((item) => item.id === targetTemplateId ? {
        ...item,
        timeMode: nextTimeMode,
        durationMinutes: normalizedDuration,
        lockOnFocusLoss: nextLockOnFocusLoss,
      } : item));
      if (savedId === targetTemplateId) {
        setTimeMode(nextTimeMode);
        if (normalizedDuration) setDurationMinutes(normalizedDuration);
        setLockOnFocusLoss(nextLockOnFocusLoss);
        const effDuration = normalizedDuration || durationMinutes;
        setSavedText(JSON.stringify([draftText, nextTimeMode, effDuration, nextLockOnFocusLoss]));
        setSavedPolicyText(JSON.stringify([nextTimeMode, normalizedDuration, nextLockOnFocusLoss]));
      }
      if (editingPolicyId === targetTemplateId) setEditingPolicyId("");
      setMessage("Ajustes de tiempo y bloqueo de pantalla actualizados.");
      try { await reloadRepository(); }
      catch { setError("Los ajustes se guardaron, pero la lista no se actualizó. Vuelve a abrir el repositorio para consultarla."); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron actualizar los ajustes de tiempo y bloqueo.");
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }

  async function approve(templateId: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("Aprobando contenido…"); setDetail("Validamos la versión y la dejamos disponible para asignación docente."); setError(""); setMessage("");
    try {
      await call("/api/teacher/assessments", "PATCH", { templateId });
      setTemplates((current) => current.map((item) => item.id === templateId ? { ...item, status: "Aprobada" } : item));
      setMessage("Contenido aprobado. Ahora puedes asignarlo al grupo seleccionado.");
      try { await reloadRepository(); }
      catch { setError("El contenido quedó aprobado, pero la lista no se actualizó. Vuelve a abrir el repositorio para consultarlo."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo aprobar."); }
    finally { inFlight.current = false; setBusy(""); }
  }

  async function removeDraft(templateId: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("Eliminando borrador en prueba…"); setDetail("Retiramos del repositorio la versión en prueba que aún no ha sido aprobada."); setError(""); setMessage("");
    try {
      const response = await fetch("/api/teacher/assessments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar el borrador.");
      setTemplates((current) => current.filter((item) => item.id !== templateId));
      if (savedId === templateId) { setSavedId(""); setSavedText(""); setSavedPolicyText(""); }
      if (sourceTemplateId === templateId) setSourceTemplateId("");
      if (editingPolicyId === templateId) setEditingPolicyId("");
      setMessage("Borrador en prueba eliminado del repositorio.");
      try { await reloadRepository(); }
      catch { setError("El borrador se eliminó, pero la lista no se actualizó. Vuelve a abrir el repositorio para consultarla."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo eliminar el borrador."); }
    finally { inFlight.current = false; setBusy(""); }
  }

  async function assign(templateId: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("Asignando examen…"); setDetail("Copiamos la versión aprobada y asignamos el examen al padrón activo del grupo."); setError(""); setMessage("");
    try {
      const result = await call("/api/teacher/assessments/assign", "POST", { templateId, partialId, groupId, requestId: requestId.current });
      setMessage(result.academicSyncPending ? "Examen asignado; queda pendiente actualizar Calificaciones." : "Examen asignado al grupo.");
      requestId.current = crypto.randomUUID();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo asignar."); }
    finally { inFlight.current = false; setBusy(""); }
  }

  return <section className="admin-controls exam-authoring" aria-labelledby="assessment-repository-title">
    <div className="section-heading"><div><p className="eyebrow">CONSTRUCTOR Y REPOSITORIOS</p><h2 id="assessment-repository-title">Evaluaciones reutilizables</h2></div><span className="admin-control-badge">Revisión obligatoria</span></div>
    <p className="admin-control-description">Generar borrador con Gemini sólo prepara una propuesta en esta pantalla. Usa Guardar borrador para conservarla, pruébala y después apruébala para asignarla. Los trabajos se asignan desde Clases.</p>
    <div className="authoring-selects"><label className="select-field"><span>Tipo de contenido</span><select value={kind} onChange={(event) => { setKind(event.target.value as Kind); setSourceTemplateId(""); setSavedId(""); setDraftText(""); setLoadedKind(null); }}><option>Examen</option><option>Actividad</option></select></label>
      <label className="select-field"><span>Grado orientativo</span><select value={grade} onChange={(event) => setGrade(event.target.value)}><option>1°</option><option>2°</option><option>3°</option></select></label>
      <label className="select-field"><span>Tiempo</span><select value={timeMode} onChange={(event) => setTimeMode(event.target.value as "Estricto" | "Libre")}><option>Estricto</option><option>Libre</option></select></label>
      {timeMode === "Estricto" && <label className="select-field"><span>Minutos</span><input type="number" min={1} max={240} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} /></label>}
      <label className="select-field"><span>Pantalla completa y pérdida de foco</span><select value={lockOnFocusLoss ? "Si" : "No"} onChange={(event) => setLockOnFocusLoss(event.target.value === "Si")}><option value="Si">Activar bloqueo</option><option value="No">Sin bloqueo</option></select></label>
    </div>
    <label className="select-field"><span>Crear nueva versión de (opcional)</span><select value={sourceTemplateId} onChange={(event) => setSourceTemplateId(event.target.value)}><option value="">Contenido nuevo</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version} · {item.status}</option>)}</select></label>

    <TeacherAssessmentGuide />

    <form className="authoring-form" onSubmit={(event) => void generate(event)}>
      <div className="authoring-single-file">
        <label>
          <span>Archivo unificado de la evaluación (.docx)</span>
          <input name="singleFile" type="file" accept=".docx" required />
          <small>Sube 1 solo archivo Word con las consignas para el alumno al inicio y la guía docente/rúbrica al final.</small>
        </label>
      </div>
      <button className="primary-button" disabled={!!busy || !partialId}>Generar borrador con IA</button>
    </form>

    {draftText && (() => {
      let parsedDraft: Draft | null = null;
      try { parsedDraft = JSON.parse(draftText) as Draft; } catch { /* parsing fallback */ }
      const totalDraftPoints = (parsedDraft?.questions || []).reduce((sum, q) => sum + (Number(q.maxScore) || 0), 0);
      const pointsAre100 = Math.abs(totalDraftPoints - 100) < 0.05;

      return (
        <div className="draft-review">
          {parsedDraft && (
            <div className="authoring-selects">
              <label className="select-field" style={{ gridColumn: "1 / -1" }}>
                <span>Nombre de la evaluación (visible para el alumno)</span>
                <input
                  type="text"
                  value={parsedDraft.name || ""}
                  onChange={(event) => {
                    if (!parsedDraft) return;
                    const updated = { ...parsedDraft, name: event.target.value };
                    setDraftText(JSON.stringify(updated, null, 2));
                  }}
                />
              </label>
            </div>
          )}

          <div className="draft-summary-bar">
            <div className="draft-stat">
              <strong>{parsedDraft?.questions?.length ?? 0}</strong>
              <span>reactivos</span>
            </div>
            <div className={`draft-stat points-stat ${pointsAre100 ? "ok" : "warn"}`}>
              <strong>{Math.round(totalDraftPoints * 10) / 10} / 100</strong>
              <span>{pointsAre100 ? "puntos (distribución completa)" : "puntos (se recomienda sumar 100)"}</span>
            </div>
            {savedId && <span className="admin-control-badge">Borrador guardado</span>}
          </div>

          {parsedDraft?.questions && parsedDraft.questions.length > 0 && (
            <div className="draft-questions-preview">
              {parsedDraft.questions.map((q, idx) => (
                <div key={idx} className="draft-question-item">
                  <div className="draft-question-item-header">
                    <span>Reactivo {q.order ?? idx + 1} · {q.topic || "Español"}</span>
                    <span className="draft-stat points-stat ok">{q.maxScore ?? 0} pts</span>
                  </div>
                  <p className="draft-q-prompt">{q.prompt}</p>
                  {q.type === "opcion_multiple" && Array.isArray(q.options) && (
                    <ul className="draft-q-options">
                      {q.options.map((opt, oIdx) => {
                        const letter = String.fromCharCode(65 + oIdx);
                        const isCorrect = q.correctAnswer === letter;
                        return (
                          <li key={oIdx} className={isCorrect ? "correct" : ""}>
                            {letter}) {opt} {isCorrect ? "✓ (Clave correcta)" : ""}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {q.type === "abierta" && q.rubric && (
                    <div className="draft-q-rubric-summary">
                      <strong>Criterios docentes y rúbrica privada:</strong>
                      {Array.isArray(q.rubric.criteria) && q.rubric.criteria.map((crit, cIdx) => (
                        <span key={cIdx}>• {crit}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <details className="draft-json-details">
            <summary>Ver / editar JSON técnico avanzado</summary>
            <label className="select-field">
              <span>Edición directa de consignas, claves, rúbricas y puntajes en JSON:</span>
              <textarea className="draft-json" value={draftText} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} />
            </label>
          </details>

          <div className="gemini-actions">
            {savedId && currentPolicySignature !== savedPolicyText && (
              <button className="primary-button" type="button" onClick={() => void savePolicy(savedId, timeMode, durationMinutes, lockOnFocusLoss)} disabled={!!busy}>
                Actualizar tiempo y bloqueo
              </button>
            )}
            <button className="secondary-button" type="button" onClick={() => void save()} disabled={!!busy || (!!savedId && saveSignature === savedText)}>
              {savedId ? "Guardar como nueva versión" : "Guardar borrador"}
            </button>
            {savedId && saveSignature === savedText && templates.some((item) => item.id === savedId && item.status === "Borrador") && (
              <button className="primary-button" type="button" onClick={() => void approve(savedId)} disabled={!!busy}>
                Aprobar versión
              </button>
            )}
            {savedId && (
              <Link className="secondary-button" href={`/docente/probar?templateId=${encodeURIComponent(savedId)}`}>
                Probar versión guardada
              </Link>
            )}
            {savedId && templates.some((item) => item.id === savedId && item.status === "Borrador") && (
              <button className="secondary-button" type="button" onClick={() => void removeDraft(savedId)} disabled={!!busy}>
                Eliminar borrador
              </button>
            )}
          </div>
        </div>
      );
    })()}
    <div className="draft-review"><h3>Repositorio de {kind === "Examen" ? "exámenes" : "actividades y trabajos"}</h3>
      {templates.length ? templates.map((item) => (
        <article className="exam-choice" key={item.id} style={{ flexWrap: "wrap" }}>
          <div>
            <strong>{item.name}</strong>
            <p>v{item.version} · {item.status} · {item.grade || "Todos los grados"} · {item.timeMode === "Libre" ? "Tiempo libre" : `${item.durationMinutes} minutos`} · {item.lockOnFocusLoss ? "Con bloqueo" : "Sin bloqueo"}</p>
          </div>
          <div className="gemini-actions">
            <button className="secondary-button" type="button" onClick={() => void openSaved(item.id)} disabled={!!busy}>Abrir</button>
            <button className="secondary-button" type="button" onClick={() => editingPolicyId === item.id ? setEditingPolicyId("") : startEditingPolicy(item)} disabled={!!busy}>
              {editingPolicyId === item.id ? "Cerrar ajustes" : "Editar tiempo y bloqueo"}
            </button>
            <Link className="secondary-button" href={`/docente/probar?templateId=${encodeURIComponent(item.id)}`}>Probar</Link>
            {item.status === "Borrador" && <button className="secondary-button" type="button" onClick={() => void approve(item.id)} disabled={!!busy}>Aprobar</button>}
            {item.status === "Borrador" && <button className="secondary-button" type="button" onClick={() => void removeDraft(item.id)} disabled={!!busy}>Eliminar</button>}
            {item.status === "Aprobada" && kind === "Examen" && <>
              <select aria-label="Grupo para asignar" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                <option value="">Selecciona grupo</option>
                {groups.filter((group) => group.active && group.studentCount > 0 && (!item.grade || item.grade === group.studentGrade)).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <button className="primary-button" type="button" onClick={() => void assign(item.id)} disabled={!!busy || !partialId || !groupId}>Asignar</button>
            </>}
          </div>
          {editingPolicyId === item.id && (
            <div className="authoring-selects" style={{ width: "100%", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(15, 23, 42, 0.08)" }}>
              <label className="select-field">
                <span>Tiempo</span>
                <select value={editTimeMode} onChange={(event) => setEditTimeMode(event.target.value as "Estricto" | "Libre")} disabled={!!busy}>
                  <option value="Estricto">Estricto</option>
                  <option value="Libre">Libre</option>
                </select>
              </label>
              {editTimeMode === "Estricto" && (
                <label className="select-field">
                  <span>Minutos (1–240)</span>
                  <input type="number" min={1} max={240} value={editDurationMinutes} onChange={(event) => setEditDurationMinutes(Number(event.target.value))} disabled={!!busy} />
                </label>
              )}
              <label className="select-field">
                <span>Pantalla completa y pérdida de foco</span>
                <select value={editLockOnFocusLoss ? "Si" : "No"} onChange={(event) => setEditLockOnFocusLoss(event.target.value === "Si")} disabled={!!busy}>
                  <option value="Si">Activar bloqueo</option>
                  <option value="No">Sin bloqueo</option>
                </select>
              </label>
              <div className="gemini-actions" style={{ alignSelf: "end" }}>
                <button className="primary-button compact" type="button" onClick={() => void savePolicy(item.id, editTimeMode, editDurationMinutes, editLockOnFocusLoss)} disabled={!!busy}>
                  Guardar tiempo y bloqueo
                </button>
                <button className="secondary-button compact" type="button" onClick={() => setEditingPolicyId("")} disabled={!!busy}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </article>
      )) : <p className="notice">Aún no hay contenido en este repositorio.</p>}
    </div>
    {message && <p className="admin-control-message gemini-success" role="status">{message}</p>}{error && <p className="notice" role="alert">{error}</p>}{busy && <ProgressOverlay title={busy} detail={detail} />}
  </section>;
}
