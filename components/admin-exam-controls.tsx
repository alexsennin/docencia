"use client";

import { useEffect, useMemo, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";

type CompletedAttempt = {
  attemptId: string;
  studentId: string;
  studentName: string;
  grade: string;
  group: string;
  examId: string;
  examName: string;
  status: string;
  submittedAt: string;
};

type StudentOption = Pick<CompletedAttempt, "studentId" | "studentName" | "grade" | "group">;
type ExamOption = { examId: string; examName: string; attempts: CompletedAttempt[]; latestSubmission: string };

export function AdminExamControls() {
  const [attempts, setAttempts] = useState<CompletedAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [examId, setExamId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadCompletedAttempts() {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/teacher/results", { cache: "no-store" });
      const payload = await response.json() as { results?: CompletedAttempt[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudieron consultar los exámenes realizados.");
      setAttempts(Array.isArray(payload.results) ? payload.results : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudieron consultar los exámenes realizados.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialAttempts() {
      try {
        const response = await fetch("/api/teacher/results", { cache: "no-store" });
        const payload = await response.json() as { results?: CompletedAttempt[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "No se pudieron consultar los exámenes realizados.");
        if (!cancelled) setAttempts(Array.isArray(payload.results) ? payload.results : []);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "No se pudieron consultar los exámenes realizados.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadInitialAttempts();
    return () => { cancelled = true; };
  }, []);

  const students = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase("es-MX");
    if (query.length < 2) return [];
    const unique = new Map<string, StudentOption>();
    for (const attempt of attempts) {
      if (attempt.studentName.toLocaleLowerCase("es-MX").includes(query)) {
        unique.set(attempt.studentId, {
          studentId: attempt.studentId,
          studentName: attempt.studentName,
          grade: attempt.grade,
          group: attempt.group,
        });
      }
    }
    return [...unique.values()].sort((a, b) => a.studentName.localeCompare(b.studentName, "es-MX"));
  }, [attempts, studentSearch]);

  const selectedStudent = students.find((student) => student.studentId === studentId)
    ?? [...new Map(attempts.map((attempt) => [attempt.studentId, {
      studentId: attempt.studentId,
      studentName: attempt.studentName,
      grade: attempt.grade,
      group: attempt.group,
    }])).values()].find((student) => student.studentId === studentId);

  const completedExams = useMemo(() => {
    const byExam = new Map<string, ExamOption>();
    for (const attempt of attempts) {
      if (attempt.studentId !== studentId) continue;
      const exam = byExam.get(attempt.examId) ?? {
        examId: attempt.examId,
        examName: attempt.examName,
        attempts: [],
        latestSubmission: attempt.submittedAt,
      };
      exam.attempts.push(attempt);
      if (attempt.submittedAt > exam.latestSubmission) exam.latestSubmission = attempt.submittedAt;
      byExam.set(attempt.examId, exam);
    }
    return [...byExam.values()].sort((a, b) => a.examName.localeCompare(b.examName, "es-MX"));
  }, [attempts, studentId]);

  const selectedExam = completedExams.find((exam) => exam.examId === examId);

  async function revoke(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudent || !selectedExam || !password) return;
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/revoke-exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, examId, password }),
      });
      const payload = await response.json() as { result?: { deletedAttempts?: number; deletedAnswers?: number; deletedAi?: number }; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo revocar el examen.");
      setMessage(`Se revocó “${selectedExam.examName}” para ${selectedStudent.studentName}. Se eliminaron ${payload.result?.deletedAttempts ?? 0} intento(s), ${payload.result?.deletedAnswers ?? 0} respuesta(s) y ${payload.result?.deletedAi ?? 0} evaluación(es) de IA. La asignación permanece activa para que pueda volver a presentarlo.`);
      setExamId("");
      setPassword("");
      await loadCompletedAttempts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo revocar el examen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-controls" aria-labelledby="admin-controls-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN DE EXÁMENES</p>
          <h2 id="admin-controls-title">Revocar examen</h2>
        </div>
        <span className="admin-control-badge">Acción docente</span>
      </div>
      <p className="admin-control-description">Busca al alumno por nombre y elige uno de sus exámenes entregados. Se borrarán los intentos y respuestas de ese examen; la asignación seguirá activa para que pueda presentarlo nuevamente.</p>

      <form className="admin-revoke-form" onSubmit={revoke}>
        <label className="select-field">
          <span>1. Buscar alumno por nombre</span>
          <input
            type="search"
            value={studentSearch}
            onChange={(event) => {
              setStudentSearch(event.target.value);
              setStudentId("");
              setExamId("");
              setPassword("");
              setMessage("");
            }}
            placeholder="Escribe al menos 2 letras"
            autoComplete="off"
            aria-label="Buscar alumno por nombre"
          />
        </label>

        <label className="select-field">
          <span>Seleccionar alumno</span>
          <select value={studentId} onChange={(event) => { setStudentId(event.target.value); setExamId(""); setPassword(""); setMessage(""); }} disabled={students.length === 0}>
            <option value="">{studentSearch.trim().length < 2 ? "Escribe el nombre para buscar" : students.length ? "Elige un alumno" : "Sin coincidencias"}</option>
            {students.map((student) => (
              <option key={student.studentId} value={student.studentId}>
                {student.studentName} · {student.grade} {student.group} · {student.studentId}
              </option>
            ))}
          </select>
        </label>

        <label className="select-field">
          <span>2. Examen realizado</span>
          <select value={examId} onChange={(event) => { setExamId(event.target.value); setPassword(""); setMessage(""); }} disabled={!studentId || completedExams.length === 0}>
            <option value="">{!studentId ? "Primero selecciona un alumno" : completedExams.length ? "Elige un examen entregado" : "No tiene exámenes realizados"}</option>
            {completedExams.map((exam) => (
              <option key={exam.examId} value={exam.examId}>
                {exam.examName} · {exam.attempts.length} intento(s)
              </option>
            ))}
          </select>
        </label>

        <label className="select-field">
          <span>Contraseña docente</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña de autorización" autoComplete="current-password" disabled={!selectedExam} />
        </label>

        <button className="danger-button" type="submit" disabled={isSubmitting || !selectedExam || !password}>
          {isSubmitting ? "Revocando…" : "Revocar examen seleccionado"}
        </button>
      </form>

      {isLoading && <p className="admin-control-hint" role="status">Consultando exámenes entregados…</p>}
      {loadError && <p className="notice" role="alert">{loadError}</p>}
      {!isLoading && !loadError && attempts.length === 0 && <p className="admin-control-hint">Aún no hay exámenes entregados para revocar.</p>}
      {selectedExam && <p className="admin-control-hint">Se encontraron {selectedExam.attempts.length} intento(s) entregados de este examen. La revocación los eliminará todos junto con sus respuestas y evaluaciones de IA.</p>}
      {message && <p className="admin-control-message" role="status">{message}</p>}
      {isSubmitting && <ProgressOverlay title="Revocando examen…" detail="Verificamos el alumno y borramos sólo sus intentos entregados del examen seleccionado." />}
    </section>
  );
}
