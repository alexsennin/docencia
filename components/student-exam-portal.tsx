"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ProgressOverlay } from "./progress-overlay";
import type { AnswerMap, ExamResult, PublicExam, Student } from "../lib/exam-types";

type Phase = "login" | "selection" | "exam" | "grading" | "result";
type SaveState = "idle" | "saving" | "saved" | "error";

export default function StudentExamPortal() {
  const [phase, setPhase] = useState<Phase>("login");
  const [studentId, setStudentId] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [exam, setExam] = useState<PublicExam | null>(null);
  const [attemptId, setAttemptId] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [result, setResult] = useState<ExamResult | null>(null);
  const [locked, setLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [message, setMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const submissionRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const answersRef = useRef<AnswerMap>({});
  const focusGuardSuppressedRef = useRef(false);
  const focusGuardTimeoutRef = useRef<number | null>(null);

  const api = useCallback(async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
    return data;
  }, []);

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setBusyMessage("Buscando tu acceso...");
    try {
      const data = await api("/api/access", { credential: studentId });
      if (data.role === "teacher") { window.location.reload(); return; }
      setStudent(data.student); setExams(data.exams); setPhase("selection");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo validar el ID."); }
    finally { setBusyMessage(""); }
  };

  const startExam = async (selectedExam: PublicExam) => {
    setMessage("");
    setBusyMessage("Preparando el examen...");
    try {
      const data = await api("/api/exam/start", { studentId, examId: selectedExam.id });
      const savedAnswers = data.answers || {};
      answersRef.current = savedAnswers;
      setExam(data.exam); setAttemptId(data.attemptId); setStartedAt(data.startedAt); setDeadlineAt(data.deadlineAt); setAnswers(savedAnswers); setSaveState("idle"); setLocked(Boolean(data.locked)); setPhase("exam");
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo iniciar el examen."); }
    finally { setBusyMessage(""); }
  };

  const submitExam = useCallback(async (reason = "manual") => {
    if (!exam || !student || submissionRef.current) return;
    submissionRef.current = true;
    setIsSubmitting(true);
    setPhase("grading");
    try {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      await saveInFlightRef.current?.catch(() => undefined);
      const data = await api("/api/exam/submit", { attemptId, examId: exam.id, studentId: student.id, answers, reason, startedAt });
      setResult(data.result); setPhase("result"); document.exitFullscreen?.().catch(() => undefined);
    } catch (error) { submissionRef.current = false; setIsSubmitting(false); setMessage(error instanceof Error ? error.message : "No se pudo enviar el examen."); setPhase("exam"); }
  }, [api, answers, attemptId, exam, startedAt, student]);

  useEffect(() => {
    if (phase !== "exam" || !deadlineAt) return;
    const update = () => { const left = Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000)); setTimeLeft(left); if (left === 0) void submitExam("tiempo_agotado"); };
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [deadlineAt, phase, submitExam]);

  useEffect(() => {
    if (phase !== "exam") return;
    const reportFocusLoss = (reason: string) => {
      if (submissionRef.current || locked || focusGuardSuppressedRef.current) return;
      setLocked(true); setMessage("El examen se bloqueó porque la ventana perdió el foco. Solicita el desbloqueo al docente.");
      void api("/api/exam/event", { attemptId, examId: exam?.id, studentId, event: reason, at: new Date().toISOString() });
    };
    const onBlur = () => reportFocusLoss("window_blur");
    const onFocus = () => {
      if (!focusGuardSuppressedRef.current) return;
      focusGuardSuppressedRef.current = false;
      if (focusGuardTimeoutRef.current !== null) window.clearTimeout(focusGuardTimeoutRef.current);
      focusGuardTimeoutRef.current = null;
    };
    const onVisibility = () => { if (document.visibilityState !== "visible") reportFocusLoss("visibility_hidden"); };
    const onFullscreen = () => { if (document.fullscreenElement === null) reportFocusLoss("fullscreen_exit"); };
    const preventClipboard = (event: ClipboardEvent) => event.preventDefault();
    const preventContext = (event: MouseEvent) => event.preventDefault();
    const preventShortcuts = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && ["c", "x", "v", "a", "p", "s"].includes(event.key.toLowerCase())) event.preventDefault(); };
    window.addEventListener("blur", onBlur); window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onVisibility); document.addEventListener("fullscreenchange", onFullscreen); document.addEventListener("copy", preventClipboard); document.addEventListener("cut", preventClipboard); document.addEventListener("paste", preventClipboard); document.addEventListener("contextmenu", preventContext); document.addEventListener("keydown", preventShortcuts);
    return () => { window.removeEventListener("blur", onBlur); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); document.removeEventListener("fullscreenchange", onFullscreen); document.removeEventListener("copy", preventClipboard); document.removeEventListener("cut", preventClipboard); document.removeEventListener("paste", preventClipboard); document.removeEventListener("contextmenu", preventContext); document.removeEventListener("keydown", preventShortcuts); };
  }, [api, attemptId, exam?.id, locked, phase, studentId]);

  const setAnswer = (questionId: string, value: string | string[]) => {
    const nextAnswers = { ...answersRef.current, [questionId]: value };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setSaveState("saving");
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const previousSave = saveInFlightRef.current;
      const currentSave = (async () => {
        await previousSave?.catch(() => undefined);
        await api("/api/exam/save", { attemptId, examId: exam?.id, studentId, answers: nextAnswers });
        setSaveState("saved");
      })();
      saveInFlightRef.current = currentSave;
      void currentSave.catch(() => setSaveState("error"));
    }, 450);
  };

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyMessage("Autorizando la continuación...");
    try {
      await api("/api/exam/unlock", { attemptId, password: unlockPassword });
      focusGuardSuppressedRef.current = true;
      if (focusGuardTimeoutRef.current !== null) window.clearTimeout(focusGuardTimeoutRef.current);
      focusGuardTimeoutRef.current = window.setTimeout(() => {
        focusGuardSuppressedRef.current = false;
        focusGuardTimeoutRef.current = null;
      }, 30_000);
      setLocked(false); setUnlockPassword(""); setMessage("Examen desbloqueado. Puedes cerrar cualquier aviso del navegador; continúa trabajando.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo desbloquear."); }
    finally { setBusyMessage(""); }
  };

  const formatTime = useMemo(() => `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`, [timeLeft]);

  if (phase === "login") return <main className="student-shell"><section className="student-card login-card"><p className="eyebrow">INSTITUTO SANTA MARÍA · ESPAÑOL</p><h1>Bienvenido a Docencia</h1><p className="student-lead">Escribe tu ID escolar para ver tus exámenes. Si eres docente, ingresa tu contraseña en el mismo campo.</p><form onSubmit={lookup} className="student-form"><label>ID escolar o contraseña docente<input type="password" value={studentId} onChange={(event) => setStudentId(event.target.value)} autoFocus autoComplete="off" placeholder="ID o contraseña" /></label><button className="primary-button" type="submit" disabled={!!busyMessage}>{busyMessage ? "Accediendo…" : "Ingresar"}</button></form>{message && <p className="notice" role="alert">{message}</p>}</section>{busyMessage && <ProgressOverlay title="Accediendo…" detail="Validamos el acceso y consultamos los exámenes asignados." />}</main>;

  if (phase === "selection") return <main className="student-shell"><section className="student-card selection-card"><div className="student-header"><div><p className="eyebrow">ALUMNO VALIDADO</p><h1>{student?.name}</h1><p>{student?.grade} · Grupo {student?.group}</p></div><button className="text-button" onClick={() => { setPhase("login"); setStudent(null); setStudentId(""); }}>Cambiar ID</button></div><h2>Exámenes asignados</h2>{exams.length === 0 ? <p className="notice">No hay exámenes publicados para tu grado, grupo y parcial.</p> : <div className="exam-list">{exams.map((item) => { const resumable = item.attemptStatus === "Activo" || item.attemptStatus === "Bloqueado"; const completed = !!item.attemptStatus && item.attemptStatus !== "Disponible" && !resumable; return <article className="exam-choice" key={item.id}><div><span className="exam-kicker">{item.partialId || "PARCIAL"} · {item.durationMinutes} MINUTOS</span><h3>{item.name}</h3><p>{item.questions.length} reactivos · Calificación máxima 100</p>{completed && <p className="notice">Examen presentado. No puedes responderlo de nuevo; consulta al docente si requiere revocación.</p>}{resumable && <p className="notice">Tienes un intento en curso. Se conserva el tiempo original.</p>}</div><button className="primary-button" onClick={() => void startExam(item)} disabled={!!busyMessage || completed}>{busyMessage ? "Preparando…" : completed ? "Ya presentado" : resumable ? "Continuar examen" : "Iniciar examen"}</button></article>; })}</div>}{message && <p className="notice">{message}</p>}</section>{busyMessage && <ProgressOverlay title={busyMessage} detail="Abrimos el intento y preparamos las preguntas del examen." />}</main>;

  if (phase === "grading") return <main className="student-shell"><section className="student-card grading-card"><div className="evaluating-spinner" /><p className="eyebrow">EVALUACIÓN EN CURSO</p><h1>Estamos evaluando tu examen</h1><p>Las respuestas cerradas se califican automáticamente. Las preguntas abiertas se revisan con la rúbrica y la evaluación de IA.</p><span>No cierres esta ventana.</span></section></main>;

  if (phase === "result" && result) return <main className="student-shell"><section className="student-card result-card"><p className="eyebrow">RESULTADO DEL EXAMEN</p><h1>{result.totalScore === null ? "Resultado provisional" : `${result.grade10} / 10`}</h1><p className="student-lead">Puntaje automático: {result.automaticScore} / {result.maxScore}{result.aiPending ? " · Pregunta abierta pendiente de evaluación docente" : ""}</p><div className="result-items">{result.items.map((item) => <div className="result-item" key={item.questionId}><strong>Reactivo {item.order}</strong><span>{item.status === "correcta" ? "Correcta" : item.status === "incorrecta" ? "Incorrecta" : item.status === "sin_respuesta" ? "Sin respuesta" : "Pendiente de IA"}</span><b>{item.score === null ? "—" : `${item.score} / ${item.maxScore}`}</b><small>{item.feedback}</small>{item.strengths?.length ? <small><strong>Fortalezas:</strong> {item.strengths.join(" ")}</small> : null}{item.opportunities?.length ? <small><strong>Áreas de oportunidad:</strong> {item.opportunities.join(" ")}</small> : null}</div>)}</div><Link className="primary-button result-link" href="/">Salir</Link></section></main>;

  if (!exam) return null;
  return (
    <main className="exam-shell">
      <header className="exam-topbar">
        <div><span className="exam-kicker">{exam.name}</span><strong>{student?.name}</strong></div>
        <div className={`exam-timer ${timeLeft < 300 ? "danger" : ""}`} aria-live="polite">Tiempo restante <b>{formatTime}</b></div>
      </header>
      <section className="exam-content">
        <div className="exam-instructions">
          <strong>Instrucciones</strong><span>{exam.instructions}</span>
          <span>Copiar, pegar, salir de la ventana y cambiar de pestaña están deshabilitados y se registran como incidentes.</span>
        </div>
        {message && <p className="notice">{message}</p>}
        {locked && (
          <div className="lock-panel">
            <strong>Examen bloqueado</strong><p>La sesión perdió el foco. El docente debe autorizar el desbloqueo.</p>
            <form onSubmit={unlock} autoComplete="off">
              <input className="unlock-code-input" type="text" inputMode="numeric" name="exam-unlock-code" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-1p-ignore="true" data-lpignore="true" value={unlockPassword} onChange={(event) => setUnlockPassword(event.target.value)} placeholder="Contraseña de desbloqueo" />
              <button className="primary-button" type="submit" disabled={!!busyMessage}>{busyMessage ? "Autorizando…" : "Desbloquear"}</button>
            </form>
          </div>
        )}
        <div className={locked ? "exam-questions locked" : "exam-questions"}>
          {exam.questions.map((question) => (
            <article className="question-card" key={question.id}>
              <div className="question-meta"><span>Reactivo {question.order}</span><small>{question.maxScore} puntos · {question.topic}</small></div>
              <h2>{question.prompt}</h2>
              {question.type === "opcion_multiple" && (
                <div className="option-list">
                  {question.options.map((item) => (
                    <label key={item.value} className="option-row">
                      <input type="radio" name={question.id} value={item.value} checked={answers[question.id] === item.value} onChange={() => setAnswer(question.id, item.value)} disabled={locked} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              )}
              {question.type === "clasificacion" && (
                <div className="classification-list">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <label key={index}>Fragmento {index + 1}
                      <select
                        value={Array.isArray(answers[question.id]) ? answers[question.id][index] || "" : ""}
                        onChange={(event) => {
                          const values = Array.isArray(answers[question.id]) ? [...answers[question.id]] : ["", "", "", "", ""];
                          values[index] = event.target.value;
                          setAnswer(question.id, values);
                        }}
                        disabled={locked}
                      >
                        <option value="">Seleccionar</option><option value="A">A · Reglamento</option><option value="B">B · Refrán</option><option value="C">C · Pregón</option>
                      </select>
                    </label>
                  ))}
                </div>
              )}
              {question.type === "abierta" && (
                <textarea rows={question.id === "ex3-q8" ? 12 : 7} value={typeof answers[question.id] === "string" ? answers[question.id] : ""} onChange={(event) => setAnswer(question.id, event.target.value)} disabled={locked} placeholder="Escribe tu respuesta aquí..." />
              )}
            </article>
          ))}
        </div>
        <div className="exam-actions">
          <span aria-live="polite">{saveState === "saving" ? "Guardando tus respuestas…" : saveState === "saved" ? "Respuestas guardadas" : saveState === "error" ? "Reintentaremos guardar al enviar el examen" : "Las respuestas se guardan automáticamente."}</span>
          <button className="primary-button" onClick={() => void submitExam()} disabled={locked || isSubmitting}>Enviar examen</button>
        </div>
      </section>
      {busyMessage && <ProgressOverlay title={busyMessage} detail="Validamos la autorización del docente y reanudamos tu examen." />}
    </main>
  );
}
