"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ProgressOverlay } from "./progress-overlay";

type Kind = "Examen" | "Actividad";
type Template = { id: string; name: string; kind: Kind; version: number; status: string; grade: string | null; timeMode: string; durationMinutes: number | null; lockOnFocusLoss: boolean };
type Group = { id: string; name: string; studentGrade: string; section: string; active: boolean; studentCount: number };
type Draft = { name: string; instructions: string; questions: unknown[]; grade: string; partialId?: string };
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
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadedKind, setLoadedKind] = useState<Kind | null>(null);
  const inFlight = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const saveSignature = JSON.stringify([draftText, timeMode, durationMinutes, lockOnFocusLoss]);

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
      setDraftText(JSON.stringify(data.draft, null, 2)); setSavedText(""); setSavedId("");
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
      setSavedId(result.templateId); setSavedText(saveSignature); setSourceTemplateId(result.templateId);
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
      setDraftText(text); setGrade(item.grade || "1°"); setTimeMode(item.timeMode === "Libre" ? "Libre" : "Estricto");
      setDurationMinutes(item.durationMinutes || 50); setLockOnFocusLoss(item.lockOnFocusLoss);
      setSourceTemplateId(item.id); setSavedId(item.id);
      setSavedText(JSON.stringify([text, item.timeMode, item.durationMinutes || 50, item.lockOnFocusLoss]));
      setMessage(`${item.name} · v${item.version} recuperado. Si lo editas, Guardar borrador creará una versión nueva.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo abrir el borrador."); }
    finally { inFlight.current = false; setBusy(""); }
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
    <form className="authoring-form" onSubmit={(event) => void generate(event)}><div className="authoring-files"><label><span>{kind === "Examen" ? "Examen" : "Actividad"} (.docx)</span><input name="examFile" type="file" accept=".docx" required /></label><label><span>Guía docente y rúbrica (.docx)</span><input name="guideFile" type="file" accept=".docx" required /></label></div><button className="primary-button" disabled={!!busy || !partialId}>Generar borrador</button></form>
    {draftText && <div className="draft-review"><label className="select-field"><span>Revisa y edita las consignas, claves, rúbricas y puntajes (JSON)</span><textarea className="draft-json" value={draftText} onChange={(event) => setDraftText(event.target.value)} spellCheck={false} /></label><div className="gemini-actions"><button className="secondary-button" type="button" onClick={() => void save()} disabled={!!busy || (!!savedId && saveSignature === savedText)}>Guardar borrador</button>{savedId && saveSignature === savedText && templates.some((item) => item.id === savedId && item.status === "Borrador") && <button className="primary-button" type="button" onClick={() => void approve(savedId)} disabled={!!busy}>Aprobar versión</button>}{savedId && <Link className="secondary-button" href={`/docente/probar?templateId=${encodeURIComponent(savedId)}`}>Probar versión guardada</Link>}</div></div>}
    <div className="draft-review"><h3>Repositorio de {kind === "Examen" ? "exámenes" : "actividades y trabajos"}</h3>
      {templates.length ? templates.map((item) => <article className="exam-choice" key={item.id}><div><strong>{item.name}</strong><p>v{item.version} · {item.status} · {item.grade || "Todos los grados"} · {item.timeMode === "Libre" ? "Tiempo libre" : `${item.durationMinutes} minutos`} · {item.lockOnFocusLoss ? "Con bloqueo" : "Sin bloqueo"}</p></div><div className="gemini-actions"><button className="secondary-button" type="button" onClick={() => void openSaved(item.id)} disabled={!!busy}>Abrir</button><Link className="secondary-button" href={`/docente/probar?templateId=${encodeURIComponent(item.id)}`}>Probar</Link>{item.status === "Borrador" && <button className="secondary-button" type="button" onClick={() => void approve(item.id)} disabled={!!busy}>Aprobar</button>}{item.status === "Aprobada" && kind === "Examen" && <><select aria-label="Grupo para asignar" value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Selecciona grupo</option>{groups.filter((group) => group.active && group.studentCount > 0 && (!item.grade || item.grade === group.studentGrade)).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button className="primary-button" type="button" onClick={() => void assign(item.id)} disabled={!!busy || !partialId || !groupId}>Asignar</button></>}</div></article>) : <p className="notice">Aún no hay contenido en este repositorio.</p>}
    </div>
    {message && <p className="admin-control-message gemini-success" role="status">{message}</p>}{error && <p className="notice" role="alert">{error}</p>}{busy && <ProgressOverlay title={busy} detail={detail} />}
  </section>;
}
