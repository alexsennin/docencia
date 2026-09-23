"use client";

import { useState } from "react";

const exams = [
  { id: "exam-1-esp-1", label: "1.º grado · Cazadores de Greenwashing" },
  { id: "exam-2-esp-1", label: "2.º grado · Cazadores de Greenwashing" },
  { id: "exam-3-esp-1", label: "3.º grado · Cazadores de Greenwashing" },
];

export function AdminExamControls() {
  const [studentId, setStudentId] = useState("");
  const [examId, setExamId] = useState(exams[0].id);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function revoke(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/revoke-exam", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, examId, password }),
      });
      const payload = await response.json() as { result?: { deletedAttempts?: number; deletedAnswers?: number; deletedAi?: number; canRetake?: boolean }; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo revocar el examen.");
      setMessage(`Examen revocado. Se eliminaron ${payload.result?.deletedAttempts ?? 0} intento(s), ${payload.result?.deletedAnswers ?? 0} respuesta(s) y ${payload.result?.deletedAi ?? 0} evaluación(es) de IA. El alumno puede volver a realizarlo.`);
      setPassword("");
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
      <p className="admin-control-description">Borra los intentos, respuestas y evaluaciones de IA del examen seleccionado. El acceso asignado permanece activo para que el alumno pueda presentarlo nuevamente.</p>
      <form className="admin-revoke-form" onSubmit={revoke}>
        <label className="select-field"><span>ID del alumno</span><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="Ej. PRUEBA-001" autoComplete="off" /></label>
        <label className="select-field"><span>Examen</span><select value={examId} onChange={(event) => setExamId(event.target.value)}>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.label}</option>)}</select></label>
        <label className="select-field"><span>Contraseña docente</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña de autorización" autoComplete="current-password" /></label>
        <button className="danger-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Revocando…" : "Revocar examen"}</button>
      </form>
      {message && <p className="admin-control-message" role="status">{message}</p>}
    </section>
  );
}
