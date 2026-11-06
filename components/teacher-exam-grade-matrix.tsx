"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";

type ExamQuestion = { questionId: string; order: number; maxScore: number; prompt?: string };
type MatrixExam = {
  examId: string;
  examName: string;
  purpose?: string;
  partialId: string;
  grade: string;
  group: string;
  groups: string[];
  timeMode?: string;
  durationMinutes?: number;
  lockOnFocusLoss?: boolean;
  sourceTemplateId?: string | null;
  questions: ExamQuestion[];
};
type Student = { studentId: string; studentName: string; grade: string; group: string };
type Answer = { questionId: string; answer: string; score: number | null; manualScore?: number | null; feedback: string; status: string };
type ExamAttempt = {
  attemptId: string;
  studentId: string;
  grade: string;
  group: string;
  examId: string;
  partialId: string;
  status: string;
  submissionState?: string;
  submittedAt: string;
  grade10?: number | null;
  manualGradeLocked?: boolean;
  manualGradeOnTen?: number | null;
  answers: Answer[];
};
type MatrixResponse = { exams?: MatrixExam[]; students?: Student[]; results?: ExamAttempt[]; error?: string };

type ScoreTarget = {
  attemptId?: string;
  studentId: string;
  studentName: string;
  examId: string;
  examName: string;
  answers: Answer[];
  manualGradeLocked?: boolean;
  manualGradeOnTen?: number | null;
  grade10?: number | null;
};

type RevokeTarget = {
  attemptId?: string;
  studentId: string;
  studentName: string;
  examId: string;
  examName: string;
  purpose?: string;
};

const groupName = (student: Student) => `${student.grade} ${student.group}`.trim();
const formatPoints = (score: number) => String(Number(score.toFixed(2)));

export function TeacherExamGradeMatrix({ active, partialId, partialName }: { active: boolean; partialId: string; partialName: string }) {
  const [exams, setExams] = useState<MatrixExam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [results, setResults] = useState<ExamAttempt[]>([]);
  const [kind, setKind] = useState<"Examen" | "Actividad">("Examen");
  const [group, setGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");

  const [scoreTarget, setScoreTarget] = useState<ScoreTarget | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [scoreReason, setScoreReason] = useState("");
  const [manualGradeLocked, setManualGradeLocked] = useState(false);
  const [manualGradeDraft, setManualGradeDraft] = useState("");

  const [finalizeAttemptId, setFinalizeAttemptId] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  const [policyExam, setPolicyExam] = useState<MatrixExam | null>(null);
  const [policyTimeMode, setPolicyTimeMode] = useState<"Estricto" | "Libre">("Estricto");
  const [policyDurationMinutes, setPolicyDurationMinutes] = useState(50);
  const [policyLockOnFocusLoss, setPolicyLockOnFocusLoss] = useState(true);
  const [policySaving, setPolicySaving] = useState(false);

  const [actionAttemptId, setActionAttemptId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [expiryBusy, setExpiryBusy] = useState(false);
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
        const response = await fetch(`/api/teacher/results?includeInProgress=true&kind=${kind}`, { cache: "no-store", signal: controller.signal });
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
  }, [active, partialId, kind]);

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
    const response = await fetch(`/api/teacher/results?includeInProgress=true&kind=${kind}`, { cache: "no-store" });
    const body = await response.json() as MatrixResponse;
    if (!response.ok) throw new Error(body.error || "No se pudieron actualizar los resultados.");
    setExams(Array.isArray(body.exams) ? body.exams : []);
    setResults(Array.isArray(body.results) ? body.results : []);
  }

  async function closeExpired() {
    if (actionInFlight.current) return;
    actionInFlight.current = true; setExpiryBusy(true); setActionMessage("");
    try {
      const response = await fetch("/api/teacher/assessments/expire", { method: "POST" });
      const body = await response.json() as { result?: { finalized: number; failed: number }; error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudieron cerrar los intentos vencidos.");
      await reloadResults();
      setActionMessage(`Intentos vencidos cerrados: ${body.result?.finalized ?? 0}. Fallidos: ${body.result?.failed ?? 0}.`);
    } catch (cause) { setActionMessage(cause instanceof Error ? cause.message : "No se pudieron cerrar los intentos vencidos."); }
    finally { actionInFlight.current = false; setExpiryBusy(false); }
  }

  async function savePolicy(exam: MatrixExam) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setPolicySaving(true);
    setActionMessage("");
    try {
      const response = await fetch("/api/teacher/assessments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updatePolicy",
          examId: exam.examId,
          templateId: exam.sourceTemplateId || undefined,
          timeMode: policyTimeMode,
          durationMinutes: policyTimeMode === "Libre" ? null : policyDurationMinutes,
          lockOnFocusLoss: policyLockOnFocusLoss,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo actualizar la configuración de tiempo y bloqueo.");
      await reloadResults();
      setPolicyExam(null);
      setActionMessage("Configuración de tiempo y bloqueo actualizada correctamente.");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudo actualizar la configuración.");
    } finally {
      actionInFlight.current = false;
      setPolicySaving(false);
    }
  }

  async function saveManualScores(target: ScoreTarget, exam: MatrixExam) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionAttemptId(target.attemptId || `score-${target.studentId}`);
    setActionMessage("");
    try {
      const answers = new Map(target.answers.map((answer) => [answer.questionId, answer]));
      const previous = new Map(exam.questions.map((question) => {
        const answer = answers.get(question.questionId);
        if (!answer) return [question.questionId, null] as const;
        const savedScore = answer?.manualScore ?? answer?.score;
        return [question.questionId, savedScore ?? (answer?.answer.trim() ? null : 0)] as const;
      }));
      const scores = Object.entries(scoreDrafts)
        .filter(([questionId, value]) => value.trim() !== "" && (previous.get(questionId) === null || Number(value) !== Number(previous.get(questionId))))
        .map(([questionId, value]) => ({ questionId, score: Number(value) }));
      if (manualGradeLocked && (!manualGradeDraft.trim() || !Number.isFinite(Number(manualGradeDraft)) || Number(manualGradeDraft) < 0 || Number(manualGradeDraft) > 10)) {
        throw new Error("La calificación final debe estar entre 0 y 10.");
      }
      const response = await fetch("/api/teacher/results/score", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptId: target.attemptId || undefined,
          examId: target.examId,
          studentId: target.studentId,
          scores,
          reason: scoreReason,
          manualGradeLocked,
          manualGradeOnTen: manualGradeLocked ? Number(manualGradeDraft) : null,
        }),
      });
      const body = await response.json() as { error?: string; academicSyncPending?: boolean };
      if (!response.ok) throw new Error(body.error || "No se pudieron guardar los puntajes.");
      await reloadResults();
      setScoreTarget(null);
      setScoreReason("");
      setActionMessage(body.academicSyncPending ? "Calificación guardada; la actualización del parcial quedó pendiente." : "Calificación guardada y parcial actualizado.");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudieron guardar los puntajes.");
    } finally {
      actionInFlight.current = false;
      setActionAttemptId("");
    }
  }

  async function unlockAttempt(attemptId: string) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionAttemptId(`unlock-${attemptId}`);
    setActionMessage("");
    try {
      const response = await fetch("/api/teacher/results/unlock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo desbloquear el intento.");
      await reloadResults();
      setActionMessage("Intento desbloqueado correctamente. El alumno puede continuar su evaluación.");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudo desbloquear el intento.");
    } finally {
      actionInFlight.current = false;
      setActionAttemptId("");
    }
  }

  async function revokeAttempt() {
    if (!revokeTarget || actionInFlight.current) return;
    actionInFlight.current = true;
    setActionAttemptId(`revoke-${revokeTarget.studentId}`);
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/revoke-exam", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId: revokeTarget.studentId, examId: revokeTarget.examId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo revocar la evaluación.");
      await reloadResults();
      const studentName = revokeTarget.studentName;
      setRevokeTarget(null);
      setActionMessage(`Evaluación revocada para ${studentName}. La asignación queda lista para un nuevo intento.`);
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudo revocar la evaluación.");
    } finally {
      actionInFlight.current = false;
      setActionAttemptId("");
    }
  }

  async function reevaluatePending(attempt: ExamAttempt) {
    if (attempt.manualGradeLocked) return;
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
      if (!response.ok) throw new Error(body.error || "No se pudo finalizar la evaluación.");
      await reloadResults();
      setFinalizeAttemptId("");
      setSelectedAttemptId(attemptId);
      setActionMessage(body.academicSyncPending ? "Evaluación finalizada; la actualización del parcial quedó pendiente." : "Evaluación finalizada y calificación registrada.");
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "No se pudo finalizar la evaluación.");
    } finally {
      actionInFlight.current = false;
      setActionAttemptId("");
    }
  }

  const finalizeAttempt = useMemo(() => results.find((a) => a.attemptId === finalizeAttemptId), [results, finalizeAttemptId]);
  const finalizeStudent = useMemo(() => students.find((s) => s.studentId === finalizeAttempt?.studentId), [students, finalizeAttempt]);

  return (
    <section className="exam-grade-matrix-module" aria-label="Matriz de calificaciones de evaluaciones">
      <div className="academic-toolbar session-context">
        <label className="select-field">
          <span>Repositorio</span>
          <select value={kind} onChange={(event) => { setKind(event.target.value as "Examen" | "Actividad"); setSelectedAttemptId(""); }}>
            <option value="Examen">Exámenes</option>
            <option value="Actividad">Trabajos con evaluación</option>
          </select>
        </label>
        <label className="select-field">
          <span>Grado y grupo</span>
          <select value={group} onChange={(event) => { setGroup(event.target.value); setSelectedAttemptId(""); }} disabled={!groups.length || loading}>
            {groups.length ? groups.map((item) => <option key={item}>{item}</option>) : <option value="">Sin grupos disponibles</option>}
          </select>
        </label>
        <span className="result-count">{partialName || "Parcial sin seleccionar"}</span>
        <button type="button" className="secondary-button" onClick={() => void closeExpired()} disabled={loading || expiryBusy || !!actionAttemptId}>
          Cerrar intentos vencidos
        </button>
      </div>

      {actionMessage && <p className="notice" role="status">{actionMessage}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      {!loading && !error && !groups.length && <div className="academic-card"><p className="dashboard-empty">No hay alumnos registrados para mostrar.</p></div>}
      {!loading && !error && groups.length > 0 && !groupExams.length && (
        <div className="academic-card"><p className="dashboard-empty">No hay {kind === "Examen" ? "exámenes" : "trabajos"} publicados para {group} en este parcial.</p></div>
      )}

      <div className="exam-grade-matrix-list">
        {groupExams.map((exam) => {
          const attempts = latestAttemptsFor(exam.examId);
          const selectedAttempt = [...attempts.values()].find((attempt) => attempt.attemptId === selectedAttemptId);
          const selectedStudent = groupStudents.find((student) => student.studentId === selectedAttempt?.studentId);
          const selectedAnswers = new Map((selectedAttempt?.answers ?? []).map((answer) => [answer.questionId, answer]));

          return (
            <section className="academic-card exam-grade-matrix-card" key={exam.examId} aria-label={`Matriz de ${exam.examName}`}>
              <div className="academic-matrix-header">
                <div>
                  <p className="eyebrow">{group} · {partialName} · {exam.purpose ?? kind}</p>
                  <h2>{exam.examName}</h2>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.82rem", background: "#f1f5f9", padding: "0.15rem 0.5rem", borderRadius: "999px", color: "#334155" }}>
                      ⏱️ {exam.timeMode === "Libre" ? "Modo Libre" : `${exam.durationMinutes ?? 50} min`}
                    </span>
                    <span style={{ fontSize: "0.82rem", background: "#f1f5f9", padding: "0.15rem 0.5rem", borderRadius: "999px", color: "#334155" }}>
                      🔒 Bloqueo: {exam.lockOnFocusLoss ? "Activo" : "Desactivado"}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem", borderRadius: "6px" }}
                      onClick={() => {
                        setPolicyExam(exam);
                        setPolicyTimeMode((exam.timeMode as "Estricto" | "Libre") || "Estricto");
                        setPolicyDurationMinutes(exam.durationMinutes ?? 50);
                        setPolicyLockOnFocusLoss(exam.lockOnFocusLoss ?? true);
                      }}
                    >
                      Editar tiempo y bloqueo
                    </button>
                  </div>
                </div>
                <span className="result-count">{exam.questions.length} preguntas · {attempts.size} con intento</span>
              </div>

              {!exam.questions.length ? (
                <p className="dashboard-empty">Esta evaluación no tiene preguntas activas.</p>
              ) : (
                <div className="matrix-scroll">
                  <table className="academic-matrix exam-grade-matrix-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Nombre del alumno</th>
                        <th>Estado y acciones</th>
                        <th>Calificación</th>
                        {exam.questions.map((question) => (
                          <th key={question.questionId} title={question.prompt || question.questionId}>P{question.order}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupStudents.map((student) => {
                        const attempt = attempts.get(student.studentId);
                        const answers = new Map((attempt?.answers ?? []).map((answer) => [answer.questionId, answer]));
                        const completed = attempt?.status === "Definitivo" || attempt?.status === "Provisional";
                        const pendingAiCount = attempt?.answers.filter((answer) => answer.status.toLowerCase() === "pendiente" && answer.answer.trim()).length ?? 0;
                        const canReevaluate = !!attempt && attempt.status === "Provisional" && pendingAiCount > 0 && !attempt.manualGradeLocked;

                        return (
                          <tr key={student.studentId} className="exam-grade-matrix-row">
                            <td>{student.studentId}</td>
                            <th scope="row">{student.studentName}</th>
                            <td className="exam-matrix-status-cell">
                              <span className="exam-matrix-state-label">Estado</span>
                              <strong className="exam-matrix-state">{attempt ? attempt.submissionState || attempt.status : "Sin intento"}</strong>
                              <div className="exam-matrix-actions">
                                {attempt && (
                                  <button
                                    type="button"
                                    className="text-button"
                                    id={`exam-detail-trigger-${attempt.attemptId}`}
                                    aria-label={`Ver respuestas de ${student.studentName} en ${exam.examName}`}
                                    aria-expanded={selectedAttemptId === attempt.attemptId}
                                    aria-controls={`exam-detail-${exam.examId}`}
                                    onClick={() => setSelectedAttemptId(attempt.attemptId)}
                                  >
                                    Ver respuestas
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => {
                                    const aMap = new Map((attempt?.answers ?? []).map((a) => [a.questionId, a]));
                                    setScoreDrafts(Object.fromEntries(exam.questions.map((q) => {
                                      const ans = aMap.get(q.questionId);
                                      const s = ans?.manualScore ?? ans?.score;
                                      return [q.questionId, String(s ?? (ans ? ans.answer.trim() ? "" : "0" : ""))];
                                    })));
                                    setScoreReason("");
                                    setManualGradeLocked(!!attempt?.manualGradeLocked);
                                    setManualGradeDraft(String(attempt?.manualGradeOnTen ?? attempt?.grade10 ?? ""));
                                    setScoreTarget({
                                      attemptId: attempt?.attemptId,
                                      studentId: student.studentId,
                                      studentName: student.studentName,
                                      examId: exam.examId,
                                      examName: exam.examName,
                                      answers: attempt?.answers ?? [],
                                      manualGradeLocked: attempt?.manualGradeLocked,
                                      manualGradeOnTen: attempt?.manualGradeOnTen,
                                      grade10: attempt?.grade10,
                                    });
                                  }}
                                >
                                  {attempt && completed ? "Editar calificación" : attempt ? "Calificar intento" : "Asignar calificación"}
                                </button>
                                {attempt?.status === "Bloqueado" && (
                                  <button
                                    type="button"
                                    className="text-button"
                                    disabled={!!actionAttemptId}
                                    onClick={() => void unlockAttempt(attempt.attemptId)}
                                  >
                                    {actionAttemptId === `unlock-${attempt.attemptId}` ? "Desbloqueando…" : "Desbloquear intento"}
                                  </button>
                                )}
                                {canReevaluate && attempt && (
                                  <button
                                    type="button"
                                    className="text-button"
                                    disabled={!!actionAttemptId}
                                    onClick={() => void reevaluatePending(attempt)}
                                  >
                                    {actionAttemptId === attempt.attemptId ? "Re-evaluando…" : `Re-evaluar (${pendingAiCount})`}
                                  </button>
                                )}
                                {attempt && !completed && (
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => setFinalizeAttemptId(attempt.attemptId)}
                                  >
                                    Finalizar {exam.purpose?.toLowerCase() ?? "evaluación"}
                                  </button>
                                )}
                                {attempt && (
                                  <button
                                    type="button"
                                    className="text-button text-button-danger"
                                    onClick={() => setRevokeTarget({
                                      attemptId: attempt.attemptId,
                                      studentId: student.studentId,
                                      studentName: student.studentName,
                                      examId: exam.examId,
                                      examName: exam.examName,
                                      purpose: exam.purpose ?? kind,
                                    })}
                                  >
                                    Revocar
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="exam-matrix-final-score">
                              {!attempt ? (
                                "—"
                              ) : attempt.grade10 == null ? (
                                "Pendiente"
                              ) : (
                                <>
                                  {formatPoints(attempt.grade10)} / 10
                                  {attempt.manualGradeLocked && <small className="exam-manual-grade-badge">Manual</small>}
                                </>
                              )}
                            </td>
                            {exam.questions.map((question) => {
                              const answer = answers.get(question.questionId);
                              const grade = !answer ? "—" : !completed ? "Sin evaluar" : answer.score === null
                                ? "Pendiente"
                                : `${formatPoints(answer.score)} / ${formatPoints(question.maxScore)}`;
                              return (
                                <td key={question.questionId} title={answer?.status || (attempt ? "Sin respuesta guardada" : "Sin intento")}>
                                  <div className="exam-matrix-answer-line">
                                    <span className="exam-matrix-answer">{answer ? answer.answer || "Sin respuesta" : "—"}</span>
                                    {answer && <small className="exam-matrix-score">, {grade.replace(/\s*\/\s*/g, "/")}</small>}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedAttempt && selectedStudent && !loading && (
                <section className="report-detail" id={`exam-detail-${exam.examId}`} aria-labelledby={`exam-detail-title-${exam.examId}`}>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setSelectedAttemptId("");
                      document.getElementById(`exam-detail-trigger-${selectedAttempt.attemptId}`)?.focus();
                    }}
                  >
                    Cerrar detalle
                  </button>
                  <h3 ref={detailHeading} tabIndex={-1} id={`exam-detail-title-${exam.examId}`}>{selectedStudent.studentName} · {exam.examName}</h3>
                  <p>{group} · {partialName} · {selectedAttempt.submissionState || selectedAttempt.status} · {selectedAttempt.grade10 == null ? "Sin calificación final" : `${formatPoints(selectedAttempt.grade10)} / 10`}</p>
                  <div className="result-items">
                    {exam.questions.map((question) => {
                      const answer = selectedAnswers.get(question.questionId);
                      return (
                        <div className="result-item" key={question.questionId}>
                          <strong>Pregunta {question.order}</strong>
                          <span>{answer?.status || (answer ? "Registrada" : "Sin respuesta registrada")}</span>
                          <b>{selectedAttempt.status !== "Definitivo" && selectedAttempt.status !== "Provisional" ? "Sin evaluar" : !answer || answer.score === null ? "Pendiente de evaluación" : `${formatPoints(answer.score)} / ${formatPoints(question.maxScore)} puntos`}</b>
                          {question.prompt && <small>{question.prompt}</small>}
                          <small className="exam-answer-text">Respuesta: {answer?.answer || "Sin respuesta"}</small>
                          {answer?.feedback && <small className="exam-answer-text">Retroalimentación: {answer.feedback}</small>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </section>
          );
        })}
      </div>

      {/* Modal: Editar tiempo y bloqueo */}
      {policyExam && (
        <div className="academic-dialog-backdrop" role="presentation">
          <section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="policy-dialog-title">
            <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => setPolicyExam(null)}>×</button>
            <p className="eyebrow">POLÍTICA DE APLICACIÓN</p>
            <h3 id="policy-dialog-title">Tiempo y bloqueo de pantalla</h3>
            <p><strong>{policyExam.examName}</strong> ({policyExam.purpose ?? kind})</p>
            <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Los cambios se aplican de inmediato al repositorio, a las asignaciones de los alumnos y a los intentos activos o bloqueados.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
              <label className="select-field">
                <span>Modo de tiempo</span>
                <select
                  value={policyTimeMode}
                  onChange={(e) => setPolicyTimeMode(e.target.value as "Estricto" | "Libre")}
                >
                  <option value="Estricto">Estricto (con temporizador y fecha límite)</option>
                  <option value="Libre">Libre (sin límite de tiempo de sesión)</option>
                </select>
              </label>

              {policyTimeMode === "Estricto" && (
                <label className="select-field">
                  <span>Duración máxima (minutos)</span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={policyDurationMinutes}
                    onChange={(e) => setPolicyDurationMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 50)))}
                  />
                </label>
              )}

              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", cursor: "pointer", fontSize: "0.9rem" }}>
                <input
                  type="checkbox"
                  checked={policyLockOnFocusLoss}
                  onChange={(e) => setPolicyLockOnFocusLoss(e.target.checked)}
                />
                <span>Bloquear examen si el alumno sale de la pestaña o pierde el foco</span>
              </label>
            </div>

            <div className="dialog-actions" style={{ marginTop: "1.5rem" }}>
              <button type="button" className="secondary-button" onClick={() => setPolicyExam(null)} disabled={policySaving}>
                Cancelar
              </button>
              <button type="button" className="primary-button" onClick={() => void savePolicy(policyExam)} disabled={policySaving}>
                {policySaving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Editar calificación */}
      {scoreTarget && (
        <div className="academic-dialog-backdrop" role="presentation">
          <section className="academic-dialog exam-score-dialog" role="dialog" aria-modal="true" aria-labelledby="score-dialog-title">
            <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => setScoreTarget(null)}>×</button>
            <p className="eyebrow">AJUSTE DOCENTE DE CALIFICACIÓN</p>
            <h3 id="score-dialog-title">Editar calificación</h3>
            <p><strong>{scoreTarget.studentName}</strong> · {scoreTarget.examName}</p>
            <p>La calificación final puede fijarse manualmente sobre 10 sin modificar los puntajes de los reactivos, o puedes asignar puntos por pregunta. Al fijarla, este intento queda excluido de futuras reevaluaciones con IA.</p>

            <label className="exam-manual-grade-toggle">
              <input
                type="checkbox"
                checked={manualGradeLocked}
                onChange={(event) => setManualGradeLocked(event.target.checked)}
              />
              <span>Fijar calificación final manualmente y omitir reevaluación</span>
            </label>

            <label className="exam-manual-grade-field">
              <span>Calificación final sobre 10</span>
              <span className="exam-score-input">
                <input
                  aria-label="Calificación final sobre 10"
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  inputMode="decimal"
                  value={manualGradeDraft}
                  disabled={!manualGradeLocked}
                  onChange={(event) => setManualGradeDraft(event.target.value)}
                />
                <small>/ 10</small>
              </span>
            </label>

            {groupExams.find((e) => e.examId === scoreTarget.examId)?.questions.length ? (
              <div className="exam-score-editor">
                {groupExams.find((e) => e.examId === scoreTarget.examId)!.questions.map((question) => {
                  const answer = scoreTarget.answers.find((item) => item.questionId === question.questionId);
                  return (
                    <label key={question.questionId}>
                      <span>
                        <strong>Pregunta {question.order}</strong>
                        <small>{answer?.answer.trim() ? answer.answer : "Sin respuesta registrada; puedes asignar puntos manualmente."}</small>
                      </span>
                      <span className="exam-score-input">
                        <input
                          aria-label={`Puntaje de pregunta ${question.order}`}
                          type="number"
                          min="0"
                          max={question.maxScore}
                          step="0.01"
                          inputMode="decimal"
                          value={scoreDrafts[question.questionId] ?? "0"}
                          onChange={(event) => setScoreDrafts((current) => ({ ...current, [question.questionId]: event.target.value }))}
                        />
                        <small>/ {formatPoints(question.maxScore)} pts</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : null}

            <label className="exam-score-reason">
              <span>Motivo del ajuste (obligatorio)</span>
              <textarea
                required
                maxLength={500}
                placeholder="Indica el motivo por el cual se asigna o ajusta la calificación…"
                value={scoreReason}
                onChange={(event) => setScoreReason(event.target.value)}
              />
            </label>

            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setScoreTarget(null)} disabled={!!actionAttemptId}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const exam = groupExams.find((e) => e.examId === scoreTarget.examId);
                  if (exam) void saveManualScores(scoreTarget, exam);
                }}
                disabled={
                  !!actionAttemptId ||
                  !scoreReason.trim() ||
                  (manualGradeLocked && (!manualGradeDraft.trim() || Number(manualGradeDraft) < 0 || Number(manualGradeDraft) > 10))
                }
              >
                {actionAttemptId ? "Guardando…" : "Guardar calificación"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Confirmación de finalización */}
      {finalizeAttemptId && finalizeStudent && (
        <div className="academic-dialog-backdrop" role="presentation">
          <section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="finalize-dialog-title">
            <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => setFinalizeAttemptId("")}>×</button>
            <p className="eyebrow">CIERRE DE INTENTO</p>
            <h3 id="finalize-dialog-title">Finalizar evaluación</h3>
            <p><strong>{finalizeStudent.studentName}</strong></p>
            <p>Se procesarán las respuestas que quedaron guardadas para este intento. Las preguntas sin respuesta se registrarán como no contestadas; las respuestas abiertas guardadas se enviarán a evaluación con IA.</p>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setFinalizeAttemptId("")} disabled={!!actionAttemptId}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void submitFinalization(finalizeAttemptId)}
                disabled={!!actionAttemptId}
              >
                {actionAttemptId === finalizeAttemptId ? "Finalizando…" : "Finalizar evaluación"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modal: Confirmación de revocación */}
      {revokeTarget && (
        <div className="academic-dialog-backdrop" role="presentation">
          <section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="revoke-dialog-title">
            <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => setRevokeTarget(null)}>×</button>
            <p className="eyebrow">REVOCAR EVALUACIÓN</p>
            <h3 id="revoke-dialog-title">¿Revocar este intento?</h3>
            <p><strong>{revokeTarget.studentName}</strong> · [{revokeTarget.purpose ?? "Evaluación"}] {revokeTarget.examName}</p>
            <p>Se eliminarán los intentos entregados, sus respuestas y calificaciones. La asignación seguirá activa para que el alumno pueda presentar un nuevo intento.</p>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setRevokeTarget(null)} disabled={!!actionAttemptId}>
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void revokeAttempt()}
                disabled={!!actionAttemptId}
              >
                {actionAttemptId === `revoke-${revokeTarget.studentId}` ? "Revocando…" : "Sí, revocar evaluación"}
              </button>
            </div>
          </section>
        </div>
      )}

      {loading && <ProgressOverlay title="Consultando matriz de calificaciones…" detail="Cargamos los reactivos, alumnos y calificaciones registradas para este parcial." />}
      {expiryBusy && <ProgressOverlay title="Cerrando intentos vencidos…" detail="Guardamos y evaluamos las respuestas recibidas antes del límite de tiempo." />}
      {policySaving && <ProgressOverlay title="Actualizando tiempo y bloqueo…" detail="Guardamos los cambios en la evaluación y actualizamos las restricciones para los alumnos." />}
      {actionAttemptId && (
        <ProgressOverlay
          title={
            actionAttemptId.startsWith("unlock-")
              ? "Desbloqueando intento…"
              : actionAttemptId.startsWith("revoke-")
              ? "Revocando evaluación…"
              : actionAttemptId === finalizeAttemptId
              ? "Finalizando evaluación…"
              : "Guardando calificación…"
          }
          detail="Procesamos la acción del alumno seleccionado y actualizamos su resultado."
        />
      )}
    </section>
  );
}
