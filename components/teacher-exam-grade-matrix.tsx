"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";

type ExamQuestion = { questionId: string; order: number; maxScore: number; prompt?: string };
type MatrixExam = { examId: string; examName: string; partialId: string; grade: string; group: string; groups: string[]; questions: ExamQuestion[] };
type Student = { studentId: string; studentName: string; grade: string; group: string };
type Answer = { questionId: string; answer: string; score: number | null; feedback: string; status: string };
type ExamAttempt = { attemptId: string; studentId: string; grade: string; group: string; examId: string; partialId: string; status: string; submittedAt: string; grade10?: number | null; answers: Answer[] };
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
        const response = await fetch("/api/teacher/results", { cache: "no-store", signal: controller.signal });
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
        const selectedAnswers = new Map((selectedAttempt?.answers ?? []).map((answer) => [answer.questionId, answer]));
        return <section className="academic-card exam-grade-matrix-card" key={exam.examId} aria-label={`Matriz de ${exam.examName}`}>
          <div className="academic-matrix-header"><div><p className="eyebrow">{group} · {partialName}</p><h2>{exam.examName}</h2></div><span className="result-count">{exam.questions.length} preguntas · {attempts.size} con intento</span></div>
          {!exam.questions.length ? <p className="dashboard-empty">Este examen no tiene preguntas activas.</p> : <div className="matrix-scroll"><table className="academic-matrix exam-grade-matrix-table"><thead><tr><th>ID</th><th>Nombre del alumno</th><th>Respuestas</th>{exam.questions.map((question) => <th key={question.questionId} title={question.questionId}>Pregunta {question.order}</th>)}</tr></thead><tbody>
            {groupStudents.map((student) => {
              const attempt = attempts.get(student.studentId);
              const answers = new Map((attempt?.answers ?? []).map((answer) => [answer.questionId, answer]));
              return <tr key={student.studentId}><td>{student.studentId}</td><th scope="row">{student.studentName}</th><td>{attempt ? <button type="button" className="text-button" id={`exam-detail-trigger-${attempt.attemptId}`} aria-label={`Ver respuestas de ${student.studentName} en ${exam.examName}`} aria-expanded={selectedAttemptId === attempt.attemptId} aria-controls={`exam-detail-${exam.examId}`} onClick={() => setSelectedAttemptId(attempt.attemptId)}>Ver respuestas</button> : "Sin intento"}</td>{exam.questions.map((question) => {
                const answer = answers.get(question.questionId);
                const grade = !answer ? "—" : answer.score === null
                  ? "Pendiente"
                  : `${formatPoints(answer.score)} / ${formatPoints(question.maxScore)}`;
                return <td key={question.questionId} title={answer?.status || (attempt ? "Sin registro de calificación" : "Sin intento")}>{grade}</td>;
              })}</tr>;
            })}
          </tbody></table></div>}
          {selectedAttempt && selectedStudent && !loading && <section className="report-detail" id={`exam-detail-${exam.examId}`} aria-labelledby={`exam-detail-title-${exam.examId}`}>
            <button className="text-button" type="button" onClick={() => {
              setSelectedAttemptId("");
              document.getElementById(`exam-detail-trigger-${selectedAttempt.attemptId}`)?.focus();
            }}>Cerrar detalle</button>
            <h3 ref={detailHeading} tabIndex={-1} id={`exam-detail-title-${exam.examId}`}>{selectedStudent.studentName} · {exam.examName}</h3>
            <p>{group} · {partialName} · {selectedAttempt.status} · {selectedAttempt.grade10 == null ? "Calificación pendiente" : `${formatPoints(selectedAttempt.grade10)} / 10`}</p>
            <div className="result-items">{exam.questions.map((question) => {
              const answer = selectedAnswers.get(question.questionId);
              return <div className="result-item" key={question.questionId}>
                <strong>Pregunta {question.order}</strong><span>{answer?.status || (answer ? "Registrada" : "Sin respuesta registrada")}</span>
                <b>{!answer || answer.score === null ? "Pendiente" : `${formatPoints(answer.score)} / ${formatPoints(question.maxScore)} puntos`}</b>
                {question.prompt && <small>{question.prompt}</small>}
                <small className="exam-answer-text">Respuesta: {answer?.answer || "Sin respuesta"}</small>
                {answer?.feedback && <small className="exam-answer-text">Retroalimentación: {answer.feedback}</small>}
              </div>;
            })}</div>
          </section>}
          {!groupStudents.length && <p className="dashboard-empty">No hay alumnos en este grupo.</p>}
        </section>;
      })}
    </div>
    {loading && <ProgressOverlay title="Consultando matriz de exámenes…" detail="Cargamos los reactivos, alumnos y calificaciones registradas para este parcial." />}
  </section>;
}
