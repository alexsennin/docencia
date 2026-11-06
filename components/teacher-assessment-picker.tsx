"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";

type Template = { id: string; name: string; grade: string | null; version: number; status: string; timeMode: string; durationMinutes: number | null; lockOnFocusLoss: boolean };
type Group = { id: string; name: string; studentGrade: string; section: string; active: boolean; studentCount: number };

export function TeacherAssessmentPicker({ partialId, sessionId, group, taskType, onClose, onAssigned }: {
  partialId: string; sessionId: string; group: string; taskType: "Tarea" | "Trabajo en clase";
  onClose: () => void; onAssigned: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [timeMode, setTimeMode] = useState<"Estricto" | "Libre">("Estricto");
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [lockOnFocusLoss, setLockOnFocusLoss] = useState(true);
  const [busy, setBusy] = useState("Consultando actividades…");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/teacher/assessments?kind=Actividad", { cache: "no-store" }),
      fetch("/api/teacher/students", { cache: "no-store" }),
    ]).then(async ([a, b]) => {
      const [content, registry] = await Promise.all([a.json(), b.json()]);
      if (!a.ok || !b.ok) throw new Error(content.error || registry.error || "No se pudo consultar el repositorio.");
      if (!cancelled) { setTemplates(content.result); setGroups(registry.groups); }
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo consultar el repositorio."); })
      .finally(() => { if (!cancelled) setBusy(""); });
    return () => { cancelled = true; };
  }, []);

  const target = groups.find((item) => item.active && `${item.studentGrade} ${item.section}`.trim() === group);
  const available = templates.filter((item) => item.status === "Aprobada" && (!item.grade || item.grade === target?.studentGrade));
  const selectedTemplate = available.find((item) => item.id === templateId) ?? null;

  const policyChanged = Boolean(
    selectedTemplate && (
      selectedTemplate.timeMode !== timeMode ||
      (timeMode === "Estricto" && (selectedTemplate.durationMinutes || 50) !== durationMinutes) ||
      Boolean(selectedTemplate.lockOnFocusLoss) !== lockOnFocusLoss
    )
  );

  function selectTemplate(nextId: string) {
    setTemplateId(nextId);
    setMessage("");
    setError("");
    const found = available.find((item) => item.id === nextId);
    if (found) {
      setTimeMode(found.timeMode === "Libre" ? "Libre" : "Estricto");
      setDurationMinutes(found.durationMinutes || 50);
      setLockOnFocusLoss(Boolean(found.lockOnFocusLoss));
    }
  }

  async function savePolicyOnly() {
    if (inFlight.current || !selectedTemplate) return;
    inFlight.current = true;
    setBusy("Actualizando tiempo y bloqueo…");
    setError("");
    setMessage("");
    try {
      const normalizedDuration = timeMode === "Libre" ? null : durationMinutes;
      const response = await fetch("/api/teacher/assessments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updatePolicy",
          templateId: selectedTemplate.id,
          timeMode,
          durationMinutes: normalizedDuration,
          lockOnFocusLoss,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudieron actualizar los ajustes de tiempo y bloqueo.");
      setTemplates((current) => current.map((item) => item.id === selectedTemplate.id ? {
        ...item,
        timeMode,
        durationMinutes: normalizedDuration,
        lockOnFocusLoss,
      } : item));
      setMessage("Ajustes de tiempo y bloqueo actualizados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron actualizar los ajustes de tiempo y bloqueo.");
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }

  async function assign() {
    if (inFlight.current || !target || !templateId) return;
    inFlight.current = true; setBusy("Asignando trabajo…"); setError(""); setMessage("");
    try {
      if (policyChanged && selectedTemplate) {
        const normalizedDuration = timeMode === "Libre" ? null : durationMinutes;
        const patchResponse = await fetch("/api/teacher/assessments", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "updatePolicy",
            templateId: selectedTemplate.id,
            timeMode,
            durationMinutes: normalizedDuration,
            lockOnFocusLoss,
          }),
        });
        const patchData = await patchResponse.json() as { error?: string };
        if (!patchResponse.ok) throw new Error(patchData.error || "No se pudieron guardar los ajustes de tiempo y bloqueo antes de asignar.");
      }
      const response = await fetch("/api/teacher/assessments/assign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId, partialId, groupId: target.id, sessionId, taskType, requestId: requestId.current }),
      });
      const data = await response.json() as { error?: string; result?: { academicSyncPending?: boolean } };
      if (!response.ok) throw new Error(data.error || "No se pudo asignar el trabajo.");
      await onAssigned();
      requestId.current = crypto.randomUUID();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo asignar el trabajo."); }
    finally { inFlight.current = false; setBusy(""); }
  }

  return <div className="academic-dialog-backdrop" role="presentation"><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-picker-title">
    <button className="dialog-close" type="button" aria-label="Cerrar" onClick={onClose} disabled={!!busy}>×</button>
    <p className="eyebrow">REPOSITORIO DE ACTIVIDADES · {group}</p><h3 id="assessment-picker-title">Agregar {taskType === "Tarea" ? "tarea" : "trabajo"} con evaluación</h3>
    <p>Selecciona contenido aprobado. Su nota vendrá del intento del alumno y se mostrará en Evaluación Continua.</p>
    <label className="select-field"><span>Actividad aprobada</span><select value={templateId} onChange={(event) => selectTemplate(event.target.value)} disabled={!!busy}><option value="">Selecciona contenido</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version} · {item.timeMode === "Libre" ? "Libre" : `${item.durationMinutes} min`} · {item.lockOnFocusLoss ? "Con bloqueo" : "Sin bloqueo"}</option>)}</select></label>
    {selectedTemplate && (
      <div className="authoring-selects" style={{ marginTop: "0.75rem" }}>
        <label className="select-field">
          <span>Tiempo</span>
          <select value={timeMode} onChange={(event) => setTimeMode(event.target.value as "Estricto" | "Libre")} disabled={!!busy}>
            <option value="Estricto">Estricto</option>
            <option value="Libre">Libre</option>
          </select>
        </label>
        {timeMode === "Estricto" && (
          <label className="select-field">
            <span>Minutos (1–240)</span>
            <input type="number" min={1} max={240} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} disabled={!!busy} />
          </label>
        )}
        <label className="select-field">
          <span>Pantalla completa y pérdida de foco</span>
          <select value={lockOnFocusLoss ? "Si" : "No"} onChange={(event) => setLockOnFocusLoss(event.target.value === "Si")} disabled={!!busy}>
            <option value="Si">Activar bloqueo</option>
            <option value="No">Sin bloqueo</option>
          </select>
        </label>
      </div>
    )}
    {!available.length && !busy && <p className="notice">No hay actividades aprobadas para este grado. Créalas en Constructor.</p>}
    {!target && !busy && <p className="notice">El grupo de la sesión no coincide con un catálogo activo.</p>}
    <div className="gemini-actions">
      {selectedTemplate && policyChanged && (
        <button className="secondary-button" type="button" onClick={() => void savePolicyOnly()} disabled={!!busy}>
          Guardar tiempo y bloqueo
        </button>
      )}
      <button className="primary-button" type="button" onClick={() => void assign()} disabled={!!busy || !templateId || !target}>
        Asignar al grupo
      </button>
    </div>
    {message && <p className="academic-success" role="status">{message}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    {busy && <ProgressOverlay title={busy} detail={busy.startsWith("Consultando") ? "Cargamos el repositorio y el catálogo de grupos." : busy.startsWith("Actualizando") ? "Guardamos los ajustes de tiempo y bloqueo de pantalla en la actividad." : "Creamos una aplicación independiente y actualizamos la sesión."} />}
  </section></div>;
}
