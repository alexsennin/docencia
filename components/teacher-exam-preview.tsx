"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProgressOverlay } from "./progress-overlay";
import { extractClassificationItems } from "../lib/exam-engine";
import type { AnswerMap, ExamResult, PublicExam } from "../lib/exam-types";

const demoOptions = [
  { id: "exam-1-esp-1", label: "1.º grado" },
  { id: "exam-2-esp-1", label: "2.º grado" },
  { id: "exam-3-esp-1", label: "3.º grado" },
];
type PreviewOption = { id: string; label: string; kind: string; status: string };

export default function TeacherExamPreview() {
  const [examId, setExamId] = useState("exam-1-esp-1");
  const [examOptions, setExamOptions] = useState<PreviewOption[]>(demoOptions.map((item) => ({ ...item, kind: "Demostración", status: "Ejemplo" })));
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [exam, setExam] = useState<PublicExam | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [busy, setBusy] = useState("");
  const [busyDetail, setBusyDetail] = useState("Esta simulación no crea intentos ni cambia calificaciones.");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [editTimeMode, setEditTimeMode] = useState<"Estricto" | "Libre">("Estricto");
  const [editDurationMinutes, setEditDurationMinutes] = useState(50);
  const [editLockOnFocusLoss, setEditLockOnFocusLoss] = useState(true);
  const evaluationInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      setBusy("Consultando evaluaciones guardadas…");
      setBusyDetail("Cargamos los exámenes y actividades en prueba disponibles.");
      setError("");
      try {
        const response = await fetch("/api/teacher/preview", { cache: "no-store" });
        const data = await response.json() as { options?: PreviewOption[]; error?: string };
        if (!response.ok || !data.options) throw new Error(data.error || "No se pudo cargar el repositorio.");
        if (!cancelled) {
          setExamOptions(data.options);
          const requested = new URLSearchParams(window.location.search).get("templateId");
          if (requested && data.options.some((item) => item.id === requested)) setExamId(requested);
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo cargar el repositorio."); }
      finally { if (!cancelled) setOptionsLoaded(true); }
    }
    void loadOptions();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!optionsLoaded) return;
    let cancelled = false;
    async function load() {
      setBusy("Abriendo examen de prueba…");
      setBusyDetail("Esta simulación no crea intentos ni cambia calificaciones.");
      setError(""); setExam(null); setResult(null); setAnswers({}); setEditingPolicy(false);
      try {
        const response = await fetch(`/api/teacher/preview?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el examen.");
        if (!cancelled) {
          setExam(data.exam);
          if (data.exam) {
            setEditTimeMode(data.exam.timeMode === "Libre" ? "Libre" : "Estricto");
            setEditDurationMinutes(data.exam.durationMinutes || 50);
            setEditLockOnFocusLoss(Boolean(data.exam.lockOnFocusLoss ?? data.exam.requiresFullscreen));
          }
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo cargar el examen."); }
      finally { if (!cancelled) setBusy(""); }
    }
    void load();
    return () => { cancelled = true; };
  }, [examId, optionsLoaded]);

  function update(questionId: string, value: string | string[]) { setAnswers((current) => ({ ...current, [questionId]: value })); }

  async function evaluate() {
    if (evaluationInFlight.current) return;
    evaluationInFlight.current = true;
    setBusy("Evaluando prueba…");
    setBusyDetail("Esta simulación no crea intentos ni cambia calificaciones.");
    setError("");
    try {
      const response = await fetch("/api/teacher/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ examId, answers }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo evaluar.");
      setResult(data.result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo evaluar."); }
    finally { evaluationInFlight.current = false; setBusy(""); }
  }

  async function savePolicy() {
    if (evaluationInFlight.current || !examId.startsWith("template-")) return;
    evaluationInFlight.current = true;
    setBusy("Actualizando tiempo y bloqueo…");
    setBusyDetail("Guardamos los nuevos ajustes de tiempo y bloqueo de pantalla en la actividad.");
    setError("");
    setMessage("");
    try {
      const normalizedDuration = editTimeMode === "Libre" ? null : editDurationMinutes;
      const response = await fetch("/api/teacher/assessments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updatePolicy",
          templateId: examId,
          timeMode: editTimeMode,
          durationMinutes: normalizedDuration,
          lockOnFocusLoss: editLockOnFocusLoss,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudieron actualizar los ajustes de tiempo y bloqueo.");
      setExam((current) => current ? {
        ...current,
        timeMode: editTimeMode,
        durationMinutes: normalizedDuration ?? 50,
        lockOnFocusLoss: editLockOnFocusLoss,
        requiresFullscreen: editLockOnFocusLoss,
      } : current);
      setEditingPolicy(false);
      setMessage("Ajustes de tiempo y bloqueo de pantalla actualizados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron actualizar los ajustes de tiempo y bloqueo.");
    } finally {
      evaluationInFlight.current = false;
      setBusy("");
    }
  }

  async function removeDraft(targetId: string) {
    if (evaluationInFlight.current) return;
    evaluationInFlight.current = true;
    setBusy("Eliminando borrador en prueba…");
    setBusyDetail("Retiramos del repositorio la evaluación en prueba que aún no está formalizada.");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/teacher/preview", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: targetId }),
      });
      const data = await response.json() as { result?: { name?: string; version?: number; kind?: string }; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar el borrador en prueba.");

      const listResponse = await fetch("/api/teacher/preview", { cache: "no-store" });
      const listData = await listResponse.json() as { options?: PreviewOption[]; error?: string };
      if (!listResponse.ok || !listData.options) throw new Error(listData.error || "Se eliminó el borrador, pero no se pudo actualizar la lista.");

      setExamOptions(listData.options);
      const removedLabel = data.result?.name ? `${data.result.kind || "Evaluación"} «${data.result.name}» (v${data.result.version ?? 1})` : "El borrador en prueba";
      setMessage(`${removedLabel} fue eliminado del espacio de pruebas.`);

      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("templateId") === targetId) {
        window.history.replaceState(null, "", "/docente/probar");
      }

      if (examId === targetId) {
        const nextOption = listData.options.find((item) => item.id.startsWith("template-")) ?? listData.options[0];
        setExamId(nextOption?.id || "exam-1-esp-1");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el borrador en prueba.");
    } finally {
      evaluationInFlight.current = false;
      setBusy("");
    }
  }

  const selectedOption = examOptions.find((option) => option.id === examId);
  const selectedIsTemplate = Boolean(examId.startsWith("template-"));
  const selectedIsDraft = Boolean(selectedOption && selectedOption.id.startsWith("template-") && selectedOption.status === "Borrador");
  const draftOptions = examOptions.filter((option) => option.id.startsWith("template-") && option.status === "Borrador");

  return <main className="student-shell"><section className="student-card selection-card teacher-preview">
    <Link className="back-link" href="/">← Panel docente</Link>
    <p className="eyebrow">VISTA DOCENTE · SIN GUARDAR INTENTOS</p>
    <h1>Espacio de Pruebas</h1>
    <p className="student-lead">Prueba borradores y versiones aprobadas de exámenes o actividades sin usar un ID ni modificar intentos o calificaciones de alumnos.</p>
    <label className="select-field"><span>Evaluación guardada o demostración</span><select value={examId} onChange={(event) => { setMessage(""); setExamId(event.target.value); }} disabled={!!busy}>{examOptions.map((option) => <option key={option.id} value={option.id}>{option.kind} · {option.label}</option>)}</select></label>
    {draftOptions.length > 0 && <div className="draft-review"><h3>Exámenes y actividades en prueba (sin formalizar)</h3>
      <div className="exam-list">{draftOptions.map((option) => <article className="exam-choice" key={option.id}>
        <div><strong>{option.kind} · {option.label}</strong><p>Borrador en pruebas · aún no aprobado ni asignado</p></div>
        <div className="gemini-actions">
          {examId !== option.id && <button className="secondary-button" type="button" onClick={() => { setMessage(""); setExamId(option.id); }} disabled={!!busy}>Abrir prueba</button>}
          <button className="secondary-button" type="button" onClick={() => void removeDraft(option.id)} disabled={!!busy}>Eliminar borrador</button>
        </div>
      </article>)}</div>
    </div>}
    {message && <p className="admin-control-message gemini-success" role="status">{message}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    {exam && <><h2>{exam.name}</h2><p>{exam.purpose || "Demostración"} · {exam.status} · {exam.questions.length} reactivos · {exam.maxScore} puntos · {exam.timeMode === "Libre" ? "sin límite de tiempo" : `${exam.durationMinutes} minutos`} · {(exam.lockOnFocusLoss ?? exam.requiresFullscreen) ? "Con bloqueo de pantalla" : "Sin bloqueo de pantalla"}</p>
      {selectedIsTemplate && (
        <div className="gemini-actions">
          <button className="secondary-button" type="button" onClick={() => setEditingPolicy((current) => !current)} disabled={!!busy}>
            {editingPolicy ? "Cerrar ajustes" : "Editar tiempo y bloqueo"}
          </button>
          {selectedIsDraft && <button className="secondary-button" type="button" onClick={() => void removeDraft(examId)} disabled={!!busy}>Eliminar este borrador en prueba</button>}
        </div>
      )}
      {selectedIsTemplate && editingPolicy && (
        <div className="authoring-selects" style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: "0.75rem", background: "rgba(15, 23, 42, 0.03)" }}>
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
            <button className="primary-button compact" type="button" onClick={() => void savePolicy()} disabled={!!busy}>
              Guardar tiempo y bloqueo
            </button>
            <button className="secondary-button compact" type="button" onClick={() => setEditingPolicy(false)} disabled={!!busy}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <div className="exam-questions">{exam.questions.map((question) => <article className="question-card" key={question.id}>
        <div className="question-meta"><span>Reactivo {question.order}</span><small>{question.maxScore} puntos · {question.topic}</small></div>
        <h2>{question.prompt}</h2>
        {question.type === "opcion_multiple" && <div className="option-list">{question.options.map((option) => <label className="option-row" key={option.value}><input type="radio" name={question.id} checked={answers[question.id] === option.value} onChange={() => update(question.id, option.value)} /><span>{option.label}</span></label>)}</div>}
        {question.type === "clasificacion" && <div className="classification-list">{extractClassificationItems(question.prompt).map((itemLabel, index) => <label key={index}><span className="classification-item-title">{itemLabel}</span><select value={Array.isArray(answers[question.id]) ? answers[question.id][index] || "" : ""} onChange={(event) => { const values = Array.isArray(answers[question.id]) ? [...answers[question.id]] : []; values[index] = event.target.value; update(question.id, values); }}><option value="">Seleccionar</option>{question.options.map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></label>)}</div>}
        {question.type === "abierta" && <textarea rows={7} value={typeof answers[question.id] === "string" ? answers[question.id] : ""} onChange={(event) => update(question.id, event.target.value)} />}
      </article>)}</div>
      <button className="primary-button" type="button" onClick={() => void evaluate()} disabled={!!busy}>Evaluar prueba</button>
    </>}
    {result && <section className="preview-result"><h2>{result.aiPending ? "Resultado provisional" : `${result.grade10} / 10`}</h2><p>Puntaje automático: {result.automaticScore} / {result.maxScore}</p><div className="result-items">{result.items.map((item) => <div className="result-item" key={item.questionId}><strong>Reactivo {item.order}</strong><span>{item.status.replaceAll("_", " ")}</span><b>{item.score === null ? "Pendiente" : `${item.score} / ${item.maxScore}`}</b><small>{item.feedback}</small>{item.opportunities?.length ? <small>Áreas de oportunidad: {item.opportunities.join(" ")}</small> : null}</div>)}</div></section>}
  </section>{busy && <ProgressOverlay title={busy} detail={busyDetail} />}</main>;
}
