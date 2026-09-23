"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProgressOverlay } from "./progress-overlay";
import type { AnswerMap, ExamResult, PublicExam } from "../lib/exam-types";

const examOptions = [
  { id: "exam-1-esp-1", label: "1.º grado" },
  { id: "exam-2-esp-1", label: "2.º grado" },
  { id: "exam-3-esp-1", label: "3.º grado" },
];

export default function TeacherExamPreview() {
  const [examId, setExamId] = useState("exam-1-esp-1");
  const [exam, setExam] = useState<PublicExam | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
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
  }, [examId]);

  function update(questionId: string, value: string | string[]) { setAnswers((current) => ({ ...current, [questionId]: value })); }

  async function evaluate() {
    setBusy("Evaluando prueba…"); setError("");
    try {
      const response = await fetch("/api/teacher/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ examId, answers }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo evaluar.");
      setResult(data.result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo evaluar."); }
    finally { setBusy(""); }
  }

  return <main className="student-shell"><section className="student-card selection-card teacher-preview">
    <Link className="back-link" href="/">← Panel docente</Link>
    <p className="eyebrow">VISTA DOCENTE · SIN GUARDAR INTENTOS</p>
    <h1>Probar exámenes</h1>
    <p className="student-lead">Responde y revisa el resultado sin usar un ID ni modificar respuestas o calificaciones de alumnos.</p>
    <div className="preview-tabs">{examOptions.map((option) => <button key={option.id} className={examId === option.id ? "primary-button compact" : "export-button"} type="button" onClick={() => setExamId(option.id)}>{option.label}</button>)}</div>
    {error && <p className="notice" role="alert">{error}</p>}
    {exam && <><h2>{exam.name}</h2><p>{exam.questions.length} reactivos · {exam.maxScore} puntos · {exam.durationMinutes} minutos</p>
      <div className="exam-questions">{exam.questions.map((question) => <article className="question-card" key={question.id}>
        <div className="question-meta"><span>Reactivo {question.order}</span><small>{question.maxScore} puntos · {question.topic}</small></div>
        <h2>{question.prompt}</h2>
        {question.type === "opcion_multiple" && <div className="option-list">{question.options.map((option) => <label className="option-row" key={option.value}><input type="radio" name={question.id} checked={answers[question.id] === option.value} onChange={() => update(question.id, option.value)} /><span>{option.label}</span></label>)}</div>}
        {question.type === "clasificacion" && <div className="classification-list">{[0, 1, 2, 3, 4].map((index) => <label key={index}>Fragmento {index + 1}<select value={Array.isArray(answers[question.id]) ? answers[question.id][index] || "" : ""} onChange={(event) => { const values = Array.isArray(answers[question.id]) ? [...answers[question.id]] : ["", "", "", "", ""]; values[index] = event.target.value; update(question.id, values); }}><option value="">Seleccionar</option><option value="A">A · Reglamento</option><option value="B">B · Refrán</option><option value="C">C · Pregón</option></select></label>)}</div>}
        {question.type === "abierta" && <textarea rows={7} value={typeof answers[question.id] === "string" ? answers[question.id] : ""} onChange={(event) => update(question.id, event.target.value)} />}
      </article>)}</div>
      <button className="primary-button" type="button" onClick={() => void evaluate()} disabled={!!busy}>Evaluar prueba</button>
    </>}
    {result && <section className="preview-result"><h2>{result.aiPending ? "Resultado provisional" : `${result.grade10} / 10`}</h2><p>Puntaje automático: {result.automaticScore} / {result.maxScore}</p><div className="result-items">{result.items.map((item) => <div className="result-item" key={item.questionId}><strong>Reactivo {item.order}</strong><span>{item.status.replaceAll("_", " ")}</span><b>{item.score === null ? "Pendiente" : `${item.score} / ${item.maxScore}`}</b><small>{item.feedback}</small>{item.opportunities?.length ? <small>Áreas de oportunidad: {item.opportunities.join(" ")}</small> : null}</div>)}</div></section>}
  </section>{busy && <ProgressOverlay title={busy} detail="Esta simulación no crea intentos ni cambia Google Sheets." />}</main>;
}
