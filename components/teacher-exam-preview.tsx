"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProgressOverlay } from "./progress-overlay";
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
  const [error, setError] = useState("");
  const evaluationInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      setBusy("Consultando evaluaciones guardadas…"); setError("");
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
      setBusy("Abriendo examen de prueba…"); setError(""); setExam(null); setResult(null); setAnswers({});
      try {
        const response = await fetch(`/api/teacher/preview?examId=${encodeURIComponent(examId)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo cargar el examen.");
        if (!cancelled) setExam(data.exam);
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
    setBusy("Evaluando prueba…"); setError("");
    try {
      const response = await fetch("/api/teacher/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ examId, answers }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo evaluar.");
      setResult(data.result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo evaluar."); }
    finally { evaluationInFlight.current = false; setBusy(""); }
  }

  return <main className="student-shell"><section className="student-card selection-card teacher-preview">
    <Link className="back-link" href="/">← Panel docente</Link>
    <p className="eyebrow">VISTA DOCENTE · SIN GUARDAR INTENTOS</p>
    <h1>Espacio de Pruebas</h1>
    <p className="student-lead">Prueba borradores y versiones aprobadas de exámenes o actividades sin usar un ID ni modificar intentos o calificaciones de alumnos.</p>
    <label className="select-field"><span>Evaluación guardada o demostración</span><select value={examId} onChange={(event) => setExamId(event.target.value)} disabled={!!busy}>{examOptions.map((option) => <option key={option.id} value={option.id}>{option.kind} · {option.label}</option>)}</select></label>
    {error && <p className="notice" role="alert">{error}</p>}
    {exam && <><h2>{exam.name}</h2><p>{exam.purpose || "Demostración"} · {exam.status} · {exam.questions.length} reactivos · {exam.maxScore} puntos · {exam.timeMode === "Libre" ? "sin límite de tiempo" : `${exam.durationMinutes} minutos`}</p>
      <div className="exam-questions">{exam.questions.map((question) => <article className="question-card" key={question.id}>
        <div className="question-meta"><span>Reactivo {question.order}</span><small>{question.maxScore} puntos · {question.topic}</small></div>
        <h2>{question.prompt}</h2>
        {question.type === "opcion_multiple" && <div className="option-list">{question.options.map((option) => <label className="option-row" key={option.value}><input type="radio" name={question.id} checked={answers[question.id] === option.value} onChange={() => update(question.id, option.value)} /><span>{option.label}</span></label>)}</div>}
        {question.type === "clasificacion" && <div className="classification-list">{[0, 1, 2, 3, 4].map((index) => <label key={index}>Fragmento {index + 1}<select value={Array.isArray(answers[question.id]) ? answers[question.id][index] || "" : ""} onChange={(event) => { const values = Array.isArray(answers[question.id]) ? [...answers[question.id]] : ["", "", "", "", ""]; values[index] = event.target.value; update(question.id, values); }}><option value="">Seleccionar</option>{question.options.map((option) => <option key={option.value} value={option.value}>{option.value} · {option.label}</option>)}</select></label>)}</div>}
        {question.type === "abierta" && <textarea rows={7} value={typeof answers[question.id] === "string" ? answers[question.id] : ""} onChange={(event) => update(question.id, event.target.value)} />}
      </article>)}</div>
      <button className="primary-button" type="button" onClick={() => void evaluate()} disabled={!!busy}>Evaluar prueba</button>
    </>}
    {result && <section className="preview-result"><h2>{result.aiPending ? "Resultado provisional" : `${result.grade10} / 10`}</h2><p>Puntaje automático: {result.automaticScore} / {result.maxScore}</p><div className="result-items">{result.items.map((item) => <div className="result-item" key={item.questionId}><strong>Reactivo {item.order}</strong><span>{item.status.replaceAll("_", " ")}</span><b>{item.score === null ? "Pendiente" : `${item.score} / ${item.maxScore}`}</b><small>{item.feedback}</small>{item.opportunities?.length ? <small>Áreas de oportunidad: {item.opportunities.join(" ")}</small> : null}</div>)}</div></section>}
  </section>{busy && <ProgressOverlay title={busy} detail="Esta simulación no crea intentos ni cambia calificaciones." />}</main>;
}
