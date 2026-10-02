"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";
import type { AnswerMap, ExamResult, PublicExam, Student } from "../lib/exam-types";

type Phase = "login" | "selection" | "exam" | "grading" | "result";
type SaveState = "idle" | "saving" | "saved" | "error";
type StudentAcademic = { matrix: Array<{ partialId: string; partialName: string; days: number; absences: number; missingTasks: number; ca: number | null; ec: number | null; ex: number | null; final10: number | null; status: string; ecDetails: Array<{ taskId: string; name: string; state: string; score: number | null }> }>; reports?: Array<{ partialId: string; summary: string; strengths: string[]; opportunities: string[]; recommendations: string[] }>; conduct?: Array<{ parcial_id: string; tipo: string; fecha: string; observacion: string }> };

export default function StudentExamPortal() {
  const [phase, setPhase] = useState<Phase>("login");
  const [studentId, setStudentId] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [academic, setAcademic] = useState<StudentAcademic | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicError, setAcademicError] = useState("");
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
  const timedOutSubmitRef = useRef(false);
  const remoteActionInFlight = useRef(false);
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
    if (remoteActionInFlight.current) return;
    remoteActionInFlight.current = true;
    setMessage("");
    setBusyMessage("Validando tu acceso…");
    try {
      const data = await api("/api/access", { credential: studentId });
      if (data.role === "teacher") { window.location.reload(); return; }
      setStudent(data.student); setExams(data.exams); setAcademicError(""); setAcademic(null); setAcademicLoading(true); setPhase("selection");
      setBusyMessage("Consultando tus calificaciones…");
      try {
        const academicResponse = await fetch(`/api/student/academic?studentId=${encodeURIComponent(data.student.id)}`, { cache: "no-store" });
        const academicData = await academicResponse.json() as StudentAcademic & { error?: string };
        if (!academicResponse.ok) throw new Error(academicData.error || "No se pudo cargar la matriz académica.");
        setAcademic(academicData);
      } catch (cause) {
        setAcademicError(cause instanceof Error ? cause.message : "No se pudo cargar la matriz académica.");
      } finally { setAcademicLoading(false); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo validar el ID."); }
    finally { remoteActionInFlight.current = false; setBusyMessage(""); }
  };

  const startExam = async (selectedExam: PublicExam) => {
    if (remoteActionInFlight.current) return;
    remoteActionInFlight.current = true;
    setMessage("");
    setBusyMessage("Preparando el examen...");
    try {
      const data = await api("/api/exam/start", { studentId, examId: selectedExam.id });
      if (data.completed && data.result) {
        setResult(data.result); setPhase("result"); document.exitFullscreen?.().catch(() => undefined); return;
      }
      if (data.submissionPending) {
        setBusyMessage("Recuperando el resultado del examen…");
        const recovered = await api("/api/exam/submit", { attemptId: data.attemptId, examId: selectedExam.id, studentId, answers: data.answers || {}, reason: "recuperar_envio" });
        setResult(recovered.result); setPhase("result"); document.exitFullscreen?.().catch(() => undefined); return;
      }
      const savedAnswers = data.answers || {};
      timedOutSubmitRef.current = false;
      answersRef.current = savedAnswers;
      setExam(data.exam); setAttemptId(data.attemptId); setStartedAt(data.startedAt); setDeadlineAt(data.deadlineAt); setAnswers(savedAnswers); setSaveState("idle"); setLocked(Boolean(data.locked)); setPhase("exam");
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo iniciar el examen."); }
    finally { remoteActionInFlight.current = false; setBusyMessage(""); }
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
    } catch (error) {
      const failure = error instanceof Error ? error.message : "No se pudo enviar el examen.";
      if (/el tiempo del examen terminó/i.test(failure)) {
        try {
          const recovery = await api("/api/exam/start", { studentId: student.id, examId: exam.id });
          if (recovery.submissionPending) {
            const recovered = await api("/api/exam/submit", { attemptId: recovery.attemptId, examId: exam.id, studentId: student.id, answers: recovery.answers || {}, reason: "recuperar_envio" });
            setResult(recovered.result); setPhase("result"); document.exitFullscreen?.().catch(() => undefined); return;
          }
        } catch { /* muestra el error de vencimiento y conserva el intento para soporte docente */ }
      }
      submissionRef.current = false; setIsSubmitting(false); setMessage(failure); setPhase("exam");
    }
  }, [api, answers, attemptId, exam, startedAt, student]);

  useEffect(() => {
    if (phase !== "exam" || !deadlineAt || locked) return;
    const update = () => {
      const left = Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0 && !timedOutSubmitRef.current) { timedOutSubmitRef.current = true; void submitExam("tiempo_agotado"); }
    };
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [deadlineAt, locked, phase, submitExam]);

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
    if (remoteActionInFlight.current) return;
    remoteActionInFlight.current = true;
    setBusyMessage("Autorizando la continuación...");
    try {
      const data = await api("/api/exam/unlock", { attemptId, password: unlockPassword });
      focusGuardSuppressedRef.current = true;
      if (focusGuardTimeoutRef.current !== null) window.clearTimeout(focusGuardTimeoutRef.current);
      focusGuardTimeoutRef.current = window.setTimeout(() => {
        focusGuardSuppressedRef.current = false;
        focusGuardTimeoutRef.current = null;
      }, 30_000);
      if (typeof data.deadlineAt === "string") setDeadlineAt(data.deadlineAt);
      setLocked(false); setUnlockPassword(""); setMessage("Examen desbloqueado. El cronómetro se reanuda con el tiempo que quedaba antes del bloqueo.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo desbloquear."); }
    finally { remoteActionInFlight.current = false; setBusyMessage(""); }
  };

  const formatTime = useMemo(() => `${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`, [timeLeft]);

  const leaveExamResult = () => {
    if (!result) return;
    setExams((current) => current.map((item) => item.id === result.examId
      ? { ...item, attemptStatus: result.aiPending ? "Provisional" : "Definitivo" }
      : item));
    setResult(null);
    setExam(null);
    setAttemptId("");
    setStartedAt("");
    setDeadlineAt("");
    setAnswers({});
    answersRef.current = {};
    setSaveState("idle");
    setMessage("");
    setPhase("selection");
  };

  if (phase === "login") return <main className="student-shell"><section className="student-card login-card"><p className="eyebrow">INSTITUTO SANTA MARÍA · ESPAÑOL</p><h1>Bienvenido a Docencia</h1><p className="student-lead">Escribe tu ID escolar para ver tus exámenes. Si eres docente, ingresa tu contraseña en el mismo campo.</p><form onSubmit={lookup} className="student-form"><label>ID escolar o contraseña docente<input type="text" value={studentId} onChange={(event) => setStudentId(event.target.value)} autoFocus autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="ID o contraseña" /></label><button className="primary-button" type="submit" disabled={!!busyMessage}>{busyMessage ? "Accediendo…" : "Ingresar"}</button></form>{message && <p className="notice" role="alert">{message}</p>}</section>{busyMessage && <ProgressOverlay title="Accediendo…" detail="Validamos el acceso y consultamos los exámenes asignados." />}</main>;

  if (phase === "selection") return <main className="student-shell"><section className="student-card selection-card"><div className="student-header"><div><p className="eyebrow">ALUMNO VALIDADO</p><h1>{student?.name}</h1><p>{student?.grade} · Grupo {student?.group}</p></div><button className="text-button" disabled={!!busyMessage} onClick={() => { setPhase("login"); setStudent(null); setStudentId(""); setAcademic(null); }}>Salir</button></div>
    <section className="student-academic"><h2>Mi avance académico</h2>{academicLoading && <p className="notice">Consultando calificaciones…</p>}{academicError && <p className="notice" role="alert">{academicError}</p>}{academic?.matrix.map((item) => <article className="student-partial-card" key={item.partialId}><div className="student-partial-heading"><strong>{item.partialName}</strong><b>{item.final10 === null ? "Calificación final pendiente" : `${item.final10.toFixed(1)} / 10`}</b></div><div className="student-grade-grid"><span>Días <b>{item.days}</b></span><span>Faltas <b>{item.absences}</b></span><span>Tareas faltantes <b>{item.missingTasks}</b></span><span>CA <b>{item.ca === null ? "Pendiente" : item.ca.toFixed(1)}</b></span><span>EC <b>{item.ec === null ? "Pendiente" : item.ec.toFixed(1)}</b></span><span>EX <b>{item.ex === null ? "Pendiente" : item.ex.toFixed(1)}</b></span></div>{item.ecDetails.some((task) => task.state.startsWith("Faltante")) && <div className="student-missing-tasks"><strong>Actividades que faltan</strong>{item.ecDetails.filter((task) => task.state.startsWith("Faltante")).map((task) => <span key={task.taskId}>{task.name} · {task.state}</span>)}</div>}{academic.conduct?.filter((note) => note.parcial_id === item.partialId && note.observacion).map((note, index) => <div className="student-teacher-note" key={`${note.fecha}-${index}`}><strong>Comentario docente · {note.tipo} ({note.fecha})</strong><span>{note.observacion}</span></div>)}</article>)}{academic?.reports?.map((report) => <article className="student-partial-card student-feedback-card" key={report.partialId}><p className="eyebrow">RETROALIMENTACIÓN · {academic.matrix.find((item) => item.partialId === report.partialId)?.partialName || report.partialId}</p><p>{report.summary}</p>{report.strengths.length > 0 && <div><strong>Fortalezas</strong><ul>{report.strengths.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}{report.opportunities.length > 0 && <div><strong>Áreas de oportunidad</strong><ul>{report.opportunities.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}{report.recommendations.length > 0 && <div><strong>Recomendaciones</strong><ul>{report.recommendations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}</article>)}</section>
    <h2>Exámenes asignados</h2>{exams.length === 0 ? <p className="notice">No hay exámenes publicados para tu grado, grupo y parcial.</p> : <div className="exam-list">{exams.map((item) => { const resumable = item.attemptStatus === "Activo" || item.attemptStatus === "Bloqueado"; const pendingResult = item.attemptStatus === "Evaluando"; const completed = !!item.attemptStatus && item.attemptStatus !== "Disponible" && !resumable && !pendingResult; return <article className="exam-choice" key={item.id}><div><span className="exam-kicker">{item.partialId || "PARCIAL"} · {item.durationMinutes} MINUTOS</span><h3>{item.name}</h3><p>{item.questions.length} reactivos · Calificación máxima 100</p>{completed && <p className="notice">Examen presentado. Puedes consultar el resultado.</p>}{resumable && <p className="notice">Tienes un intento en curso. Se conserva el tiempo restante.</p>}{pendingResult && <p className="notice">El envío quedó registrado. Puedes recuperar el resultado.</p>}</div><button className="primary-button" onClick={() => void startExam(item)} disabled={!!busyMessage}>{busyMessage ? "Preparando…" : pendingResult ? "Recuperar resultado" : completed ? "Ver resultado" : resumable ? "Continuar examen" : "Iniciar examen"}</button></article>; })}</div>}{message && <p className="notice">{message}</p>}</section>{busyMessage && <ProgressOverlay title={busyMessage} detail={busyMessage.startsWith("Recuperando") ? "El envío ya está guardado; recuperamos la evaluación registrada." : busyMessage.startsWith("Consultando") ? "Consultamos tu matriz, tareas pendientes y comentarios docentes." : "Abrimos el intento y preparamos las preguntas."} />}</main>;

  if (phase === "grading") return <main className="student-shell"><section className="student-card grading-card"><div className="evaluating-spinner" /><p className="eyebrow">EVALUACIÓN EN CURSO</p><h1>Estamos evaluando tu examen</h1><p>Las respuestas cerradas se califican automáticamente. Las preguntas abiertas se revisan con la rúbrica y la evaluación de IA.</p><span>No cierres esta ventana.</span></section></main>;

  if (phase === "result" && result) return <main className="student-shell"><section className="student-card result-card"><p className="eyebrow">RESULTADO DEL EXAMEN</p><h1>{result.totalScore === null ? "Resultado provisional" : `${result.grade10} / 10`}</h1><p className="student-lead">Puntaje automático: {result.automaticScore} / {result.maxScore}{result.aiPending ? " · Pregunta abierta pendiente de evaluación docente" : ""}</p><div className="result-items">{result.items.map((item) => <div className="result-item" key={item.questionId}><strong>Reactivo {item.order}</strong><span>{item.status === "correcta" ? "Correcta" : item.status === "incorrecta" ? "Incorrecta" : item.status === "sin_respuesta" ? "Sin respuesta" : "Pendiente de IA"}</span><b>{item.score === null ? "—" : `${item.score} / ${item.maxScore}`}</b><small>{item.feedback}</small>{item.strengths?.length ? <small><strong>Fortalezas:</strong> {item.strengths.join(" ")}</small> : null}{item.opportunities?.length ? <small><strong>Áreas de oportunidad:</strong> {item.opportunities.join(" ")}</small> : null}</div>)}</div><button className="primary-button result-link" type="button" onClick={leaveExamResult}>Salir</button></section></main>;

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
