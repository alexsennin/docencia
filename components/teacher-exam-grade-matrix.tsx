"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";

type ExamQuestion = { questionId: string; order: number; maxScore: number; prompt?: string };
type MatrixExam = { examId: string; examName: string; partialId: string; grade: string; group: string; groups: string[]; questions: ExamQuestion[] };
type Student = { studentId: string; studentName: string; grade: string; group: string };
type Answer = { questionId: string; answer: string; score: number | null; manualScore?: number | null; feedback: string; status: string };
type ExamAttempt = { attemptId: string; studentId: string; grade: string; group: string; examId: string; partialId: string; status: string; submissionState?: string; submittedAt: string; grade10?: number | null; answers: Answer[] };
type MatrixResponse = { exams?: MatrixExam[]; students?: Student[]; results?: ExamAttempt[]; error?: string };

const groupName = (student: Student) => `${student.grade} ${student.group}`.trim();
const formatPoints = (score: number) => String(Number(score.toFixed(2)));

export function TeacherExamGradeMatrix({ active, partialId, partialName }: { active: boolean; partialId: string; partialName: string }) {
  const [exams, setExams] = useState<MatrixExam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [group, setGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [scoreDialogAttemptId, setScoreDialogAttemptId] = useState("");
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [scoreReason, setScoreReason] = useState("");
  const [finalizeAttemptId, setFinalizeAttemptId] = useState("");
  const [actionAttemptId, setActionAttemptId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const actionInFlight = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (selectedAttemptId) detailHeading.current?.focus();
  }, [selectedAttemptId]);

  useEffect(() => {
    if (!active || !partialId) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setSelectedAttemptId("");
      try {
        const response = await fetch("/api/teacher/results?includeInProgress=true", { cache: "no-store", signal: controller.signal });
        const body = await response.json() as MatrixResponse;
        if (!response.ok) throw new Error(body.error || "No se pudo cargar la matriz de exámenes.");
        if (cancelled) return;
        const nextStudents = Array.isArray(body.students) ? body.students : [];
        setStudents(nextStudents);
        setExams(Array.isArray(body.exams) ? body.exams : []);
        setResults(Array.isArray(body.results) ? body.results : []);
        const nextGroups = Array.from(new Set(nextStudents.map(groupName).filter((name) => name && !/(PRUEBA|TEST)/i.test(name))))
          .sort((a, b) => a.localeCompare(b, "es-MX", { numeric: true }));
        setGroup((current) => nextGroups.includes(current) ? current : nextGroups[0] ?? "");
      } catch (cause) {
        if (!cancelled && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "No se pudo cargar la matriz de exámenes.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [active, partialId]);

  const groups = useMemo(() => Array.from(new Set(students.map(groupName).filter((name) => name && !/(PRUEBA|TEST)/i.test(name))))
    .sort((a, b) => a.localeCompare(b, "es-MX", { numeric: true })), [students]);
  const groupStudents = useMemo(() => students.filter((student) => groupName(student) === group && !/(PRUEBA|TEST)/i.test(groupName(student)))
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "es-MX")), [students, group]);
  const groupExams = useMemo(() => exams.filter((exam) => exam.partialId === partialId && exam.groups.includes(group))
    .sort((a, b) => a.examName.localeCompare(b.examName, "es-MX")), [exams, group, partialId]);

  function latestAttemptsFor(examId: string) {
    const studentIds = new Set(groupStudents.map((student) => student.studentId));
    const matching = results.filter((result) => result.partialId === partialId && result.examId === examId && studentIds.has(result.studentId))
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    return new Map(matching.map((attempt) => [attempt.studentId, attempt]));
  }

  async function reloadResults() {
    const response = await fetch("/api/teacher/results?includeInProgress=true", { cache: "no-store" });
    const body = await response.json() as MatrixResponse;
    if (!response.ok) throw new Error(body.error || "No se pudieron actualizar los resultados.");
    setResults(Array.isArray(body.results) ? body.results : []);
  }

  async function saveManualScores(attempt: ExamAttempt) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionAttemptId(attempt.attemptId);
    setActionMessage("");
    try {
      const previous = new Map(attempt.answers.map((answer) => [answer.questionId, answer.manualScore ?? answer.score]));
      const scores = Object.entries(scoreDrafts)
        .filter(([questionId, value]) => value.trim() !== "" && Number(value) !== Number(previous.get(questionId)))
        .map(([questionId, value]) => ({ questionId, score: Number(value) }));
      if (!scores.length) throw new Error("No hay cambios de puntaje para guardar.");
      const response = await fetch("/api/teacher/results/score", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.attemptId, scores, reason: scoreReason }),
      });
      const body = await response.json() as { error?: string; academicSyncPending?: boolean };
      if (!response.ok) throw new Error(body.error || "No se pudieron guardar los puntajes.");
      await reloadResults();
      setScoreDialogAttemptId("");
      setScoreReason("");
      setActionMessage(body.academicSyncPending ? "Puntajes guardados; la actualización del parcial quedó pendiente." : "Puntajes guardados y parcial actualizado.");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudieron guardar los puntajes.");
    } finally {
      actionInFlight.current = false;
      setActionAttemptId("");
    }
  }

  async function reevaluatePending(attempt: ExamAttempt) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionAttemptId(attempt.attemptId);
    setActionMessage("");
    try {
      const pending = attempt.answers.filter((answer) => answer.status.toLowerCase() === "pendiente" && answer.answer.trim());
      if (!pending.length) throw new Error("Este alumno no tiene respuestas abiertas pendientes de IA.");
      for (const answer of pending) {
        const response = await fetch("/api/teacher/results/reevaluate", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId: attempt.attemptId, questionId: answer.questionId }),
        });
        const body = await response.json() as { error?: string };
        if (!response.ok) throw new Error(body.error || "No se pudo re-evaluar una respuesta pendiente.");
      }
      await reloadResults();
      setActionMessage(`Se re-evaluaron ${pending.length} respuesta(s) abierta(s) de este alumno.`);
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudo re-evaluar el intento.");
    } finally {
      actionInFlight.current = false;
      setActionAttemptId("");
    }
  }

  async function submitFinalization(attemptId: string) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionAttemptId(attemptId);
    setActionMessage("");
    try {
      const response = await fetch("/api/teacher/results/finalize", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attemptId }),
      });
      const body = await response.json() as { error?: string; academicSyncPending?: boolean };
      if (!response.ok) throw new Error(body.error || "No se pudo finalizar el examen.");
      await reloadResults();
      setFinalizeAttemptId("");
      setSelectedAttemptId(attemptId);
      setActionMessage(body.academicSyncPending ? "Examen finalizado; la actualización del parcial quedó pendiente." : "Examen finalizado y calificación registrada.");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudo finalizar el examen.");
    } finally {
      actionInFlight.current = false;
      setActionAttemptId("");
    }
  }

  return <section className="exam-grade-matrix-module" aria-label="Matriz de calificaciones de exámenes">
    <div className="academic-toolbar session-context">
      <label className="select-field"><span>Grado y grupo</span><select value={group} onChange={(event) => { setGroup(event.target.value); setSelectedAttemptId(""); }} disabled={!groups.length || loading}>
        {groups.length ? groups.map((item) => <option key={item}>{item}</option>) : <option value="">Sin grupos disponibles</option>}
      </select></label>
      <span className="result-count">{partialName || "Parcial sin seleccionar"}</span>
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
    {!loading && !error && !groups.length && <div className="academic-card"><p className="dashboard-empty">No hay alumnos registrados para mostrar.</p></div>}
    {!loading && !error && groups.length > 0 && !groupExams.length && <div className="academic-card"><p className="dashboard-empty">No hay exámenes publicados para {group} en este parcial.</p></div>}
    <div className="exam-grade-matrix-list">
      {groupExams.map((exam) => {
        const attempts = latestAttemptsFor(exam.examId);
        const selectedAttempt = [...attempts.values()].find((attempt) => attempt.attemptId === selectedAttemptId);
        const selectedStudent = groupStudents.find((student) => student.studentId === selectedAttempt?.studentId);
        const scoreAttempt = [...attempts.values()].find((attempt) => attempt.attemptId === scoreDialogAttemptId);
        const scoreStudent = groupStudents.find((student) => student.studentId === scoreAttempt?.studentId);
        const finalizeTarget = [...attempts.values()].find((attempt) => attempt.attemptId === finalizeAttemptId);
        const finalizeStudent = groupStudents.find((student) => student.studentId === finalizeTarget?.studentId);
        const selectedAnswers = new Map((selectedAttempt?.answers ?? []).map((answer) => [answer.questionId, answer]));
        return <section className="academic-card exam-grade-matrix-card" key={exam.examId} aria-label={`Matriz de ${exam.examName}`}>
          <div className="academic-matrix-header"><div><p className="eyebrow">{group} · {partialName}</p><h2>{exam.examName}</h2></div><span className="result-count">{exam.questions.length} preguntas · {attempts.size} con intento</span></div>
          {!exam.questions.length ? <p className="dashboard-empty">Este examen no tiene preguntas activas.</p> : <div className="matrix-scroll"><table className="academic-matrix exam-grade-matrix-table"><thead><tr><th>ID</th><th>Nombre del alumno</th><th>Estado y detalle</th>{exam.questions.map((question) => <th key={question.questionId} title={question.prompt || question.questionId}>Pregunta {question.order}</th>)}</tr></thead><tbody>
            {groupStudents.map((student) => {
              const attempt = attempts.get(student.studentId);
              const answers = new Map((attempt?.answers ?? []).map((answer) => [answer.questionId, answer]));
              const completed = attempt?.status === "Definitivo" || attempt?.status === "Provisional";
              const pendingAiCount = attempt?.answers.filter((answer) => answer.status.toLowerCase() === "pendiente" && answer.answer.trim()).length ?? 0;
              return <Fragment key={student.studentId}>
                <tr key={`${student.studentId}-status`} className="exam-grade-matrix-status-row"><td rowSpan={2}>{student.studentId}</td><th scope="row" rowSpan={2}>{student.studentName}</th><td><span className="exam-matrix-state-label">Estado del intento</span><strong className="exam-matrix-state">{attempt ? attempt.submissionState || attempt.status : "Sin intento"}</strong></td>{exam.questions.map((question) => {
                const answer = answers.get(question.questionId);
                const grade = !answer ? "—" : !completed ? "Sin evaluar" : answer.score === null
                  ? "Pendiente de evaluación"
                  : `${formatPoints(answer.score)} / ${formatPoints(question.maxScore)}`;
                return <td key={question.questionId} rowSpan={2} title={answer?.status || (attempt ? "Sin respuesta guardada" : "Sin intento")}><span className="exam-matrix-answer">{answer ? answer.answer || "Sin respuesta" : "—"}</span>{answer && <small className="exam-matrix-score">{grade}</small>}</td>;
              })}</tr>
              <tr key={`${student.studentId}-actions`} className="exam-grade-matrix-actions-row"><td><div className="exam-matrix-actions">{attempt && <button type="button" className="text-button" id={`exam-detail-trigger-${attempt.attemptId}`} aria-label={`Ver respuestas de ${student.studentName} en ${exam.examName}`} aria-expanded={selectedAttemptId === attempt.attemptId} aria-controls={`exam-detail-${exam.examId}`} onClick={() => setSelectedAttemptId(attempt.attemptId)}>Ver respuestas</button>}{attempt && completed && <button type="button" className="text-button" onClick={() => {
                setScoreDrafts(Object.fromEntries(attempt.answers.filter((answer) => answer.answer.trim()).map((answer) => [answer.questionId, String(answer.manualScore ?? answer.score ?? "")])));
                setScoreReason(""); setScoreDialogAttemptId(attempt.attemptId);
              }}>Editar calificación</button>}{attempt && attempt.status === "Provisional" && pendingAiCount > 0 && <button type="button" className="text-button" disabled={!!actionAttemptId} onClick={() => void reevaluatePending(attempt)}>{actionAttemptId === attempt.attemptId ? "Re-evaluando…" : `Re-evaluar (${pendingAiCount})`}</button>}{attempt && !completed && <button type="button" className="text-button" onClick={() => setFinalizeAttemptId(attempt.attemptId)}>Finalizar examen</button>}{!attempt && <span>—</span>}</div></td></tr>
              </Fragment>;
            })}
          </tbody></table></div>}
          {selectedAttempt && selectedStudent && !loading && <section className="report-detail" id={`exam-detail-${exam.examId}`} aria-labelledby={`exam-detail-title-${exam.examId}`}>
            <button className="text-button" type="button" onClick={() => {
              setSelectedAttemptId("");
              document.getElementById(`exam-detail-trigger-${selectedAttempt.attemptId}`)?.focus();
            }}>Cerrar detalle</button>
            <h3 ref={detailHeading} tabIndex={-1} id={`exam-detail-title-${exam.examId}`}>{selectedStudent.studentName} · {exam.examName}</h3>
            <p>{group} · {partialName} · {selectedAttempt.submissionState || selectedAttempt.status} · {selectedAttempt.grade10 == null ? "Sin calificación final" : `${formatPoints(selectedAttempt.grade10)} / 10`}</p>
            <div className="result-items">{exam.questions.map((question) => {
              const answer = selectedAnswers.get(question.questionId);
              return <div className="result-item" key={question.questionId}>
                <strong>Pregunta {question.order}</strong><span>{answer?.status || (answer ? "Registrada" : "Sin respuesta registrada")}</span>
                <b>{selectedAttempt.status !== "Definitivo" && selectedAttempt.status !== "Provisional" ? "Sin evaluar" : !answer || answer.score === null ? "Pendiente de evaluación" : `${formatPoints(answer.score)} / ${formatPoints(question.maxScore)} puntos`}</b>
                {question.prompt && <small>{question.prompt}</small>}
                <small className="exam-answer-text">Respuesta: {answer?.answer || "Sin respuesta"}</small>
                {answer?.feedback && <small className="exam-answer-text">Retroalimentación: {answer.feedback}</small>}
              </div>;
            })}</div>
          </section>}
          {actionMessage && <p className="notice" role="status">{actionMessage}</p>}
          {scoreAttempt && scoreStudent && <div className="academic-dialog-backdrop" role="presentation"><section className="academic-dialog exam-score-dialog" role="dialog" aria-modal="true" aria-labelledby={`exam-score-title-${exam.examId}`}><button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => setScoreDialogAttemptId("")}>×</button><p className="eyebrow">AJUSTE DOCENTE POR ALUMNO</p><h3 id={`exam-score-title-${exam.examId}`}>Editar calificación</h3><p>{scoreStudent.studentName} · {exam.examName}</p><p>El ajuste modifica sólo los puntos del reactivo. No cambia la respuesta ni su estado de correcta o incorrecta.</p><div className="exam-score-editor">{exam.questions.map((question) => { const answer = scoreAttempt.answers.find((item) => item.questionId === question.questionId); return <label key={question.questionId}><span>Pregunta {question.order} · {answer?.answer.trim() ? answer.answer : "Sin respuesta"}</span>{answer?.answer.trim() ? <span className="exam-score-input"><input aria-label={`Puntaje de pregunta ${question.order}`} inputMode="decimal" value={scoreDrafts[question.questionId] ?? ""} onChange={(event) => setScoreDrafts((current) => ({ ...current, [question.questionId]: event.target.value }))} /><small>/ {formatPoints(question.maxScore)} puntos</small></span> : <small>Sin respuesta guardada</small>}</label>; })}</div><label className="exam-score-reason"><span>Motivo del ajuste</span><textarea required maxLength={500} value={scoreReason} onChange={(event) => setScoreReason(event.target.value)} /></label><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setScoreDialogAttemptId("")} disabled={!!actionAttemptId}>Cancelar</button><button type="button" className="primary-button" onClick={() => void saveManualScores(scoreAttempt)} disabled={!!actionAttemptId || !scoreReason.trim()}>{actionAttemptId === scoreAttempt.attemptId ? "Guardando…" : "Guardar calificación"}</button></div></section></div>}
          {finalizeTarget && finalizeStudent && <div className="academic-dialog-backdrop" role="presentation"><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby={`exam-finalize-title-${exam.examId}`}><button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => setFinalizeAttemptId("")}>×</button><p className="eyebrow">CIERRE DE INTENTO</p><h3 id={`exam-finalize-title-${exam.examId}`}>Finalizar examen</h3><p>{finalizeStudent.studentName} · {exam.examName}</p><p>Se procesarán las respuestas que quedaron guardadas para este intento. Las preguntas sin respuesta se registrarán como no contestadas; las respuestas abiertas guardadas se enviarán a evaluación con IA.</p><p><strong>{finalizeTarget.answers.filter((answer) => answer.answer.trim()).length} respuestas guardadas</strong> · {exam.questions.length - finalizeTarget.answers.filter((answer) => answer.answer.trim()).length} sin respuesta</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setFinalizeAttemptId("")} disabled={!!actionAttemptId}>Cancelar</button><button type="button" className="primary-button" onClick={() => void submitFinalization(finalizeTarget.attemptId)} disabled={!!actionAttemptId}>{actionAttemptId === finalizeTarget.attemptId ? "Finalizando…" : "Finalizar examen"}</button></div></section></div>}
          {!groupStudents.length && <p className="dashboard-empty">No hay alumnos en este grupo.</p>}
        </section>;
      })}
    </div>
    {loading && <ProgressOverlay title="Consultando matriz de exámenes…" detail="Cargamos los reactivos, alumnos y calificaciones registradas para este parcial." />}
    {actionAttemptId && <ProgressOverlay title={actionAttemptId === finalizeAttemptId ? "Finalizando examen…" : scoreDialogAttemptId === actionAttemptId ? "Guardando calificación…" : "Re-evaluando respuestas pendientes…"} detail="Procesamos la acción del alumno seleccionado y actualizamos su resultado." />}
  </section>;
}
