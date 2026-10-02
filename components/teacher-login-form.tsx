"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ProgressOverlay } from "./progress-overlay";

export function TeacherLoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlight = useRef(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/teacher/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
      window.location.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión.");
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className="student-shell">
      <section className="student-card login-card teacher-login-card">
        <Link className="back-link" href="/alumno">← Acceso de alumnos</Link>
        <p className="eyebrow">INSTITUTO SANTA MARÍA · ESPAÑOL</p>
        <h1>Acceso docente</h1>
        <p className="student-lead">Escribe tu contraseña para entrar al panel de evaluación.</p>
        <form className="student-form" onSubmit={signIn}>
          <label>Contraseña
            <input type="text" autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Accediendo…" : "Ingresar"}</button>
        </form>
        {error && <p className="notice" role="alert">{error}</p>}
      </section>
      {isSubmitting && <ProgressOverlay title="Accediendo…" detail="Verificamos tu contraseña y abrimos el panel docente." />}
    </main>
  );
}
