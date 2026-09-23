"use client";

import { useEffect, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";

type Settings = { configured: boolean; model: string };

export function TeacherGeminiSettings() {
  const [settings, setSettings] = useState<Settings>({ configured: false, model: "gemini-3.6-flash" });
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/gemini", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as Settings & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo leer la configuración.");
      if (!cancelled) setSettings(data);
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo leer la configuración."); });
    return () => { cancelled = true; };
  }, []);

  async function submit(action: "save" | "test") {
    setBusy(action === "save" ? "Guardando clave en Apps Script…" : "Probando conexión con Gemini…");
    setError(""); setMessage("");
    try {
      const response = await fetch("/api/teacher/gemini", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "save" ? { action, apiKey, model: settings.model } : { action }) });
      const data = await response.json() as Settings & { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "No se completó la operación.");
      if (action === "save") { setSettings({ configured: data.configured, model: data.model }); setApiKey(""); }
      setMessage(data.message || "Configuración actualizada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se completó la operación."); }
    finally { setBusy(""); }
  }

  return <section className="admin-controls gemini-settings" aria-labelledby="gemini-settings-title">
    <div className="section-heading"><div><p className="eyebrow">INTELIGENCIA ARTIFICIAL</p><h2 id="gemini-settings-title">Evaluación con Gemini</h2></div><span className={`admin-control-badge ${settings.configured ? "gemini-ready" : ""}`}>{settings.configured ? "Clave configurada" : "Falta configurar"}</span></div>
    <p className="admin-control-description">La clave se guarda en las Propiedades del proyecto de Apps Script. Sólo se muestra si está configurada; nunca se devuelve a esta página.</p>
    <div className="gemini-settings-form">
      <label className="select-field"><span>Modelo Gemini</span><input value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))} placeholder="gemini-3.6-flash" autoComplete="off" /></label>
      <label className="select-field"><span>API key {settings.configured ? "(dejar vacío para conservar la actual)" : ""}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.configured ? "Clave guardada" : "Pega aquí la clave API"} autoComplete="new-password" spellCheck={false} /></label>
      <div className="gemini-actions"><button className="primary-button" type="button" onClick={() => void submit("save")} disabled={!!busy || !settings.model.trim() || (!settings.configured && !apiKey.trim())}>Guardar configuración</button><button className="export-button gemini-test" type="button" onClick={() => void submit("test")} disabled={!!busy || !settings.configured}>Probar conexión</button><small>La prueba envía una solicitud breve a Gemini y puede consumir cuota de API.</small></div>
    </div>
    {message && <p className="admin-control-message gemini-success" role="status">{message}</p>}{error && <p className="notice" role="alert">{error}</p>}
    {busy && <ProgressOverlay title={busy} detail="La clave se transmite directamente al puente privado y queda guardada en Apps Script." />}
  </section>;
}
