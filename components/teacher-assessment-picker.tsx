"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressOverlay } from "./progress-overlay";

type Template = { id: string; name: string; grade: string | null; version: number; status: string; timeMode: string; durationMinutes: number | null };
type Group = { id: string; name: string; studentGrade: string; section: string; active: boolean; studentCount: number };

export function TeacherAssessmentPicker({ partialId, sessionId, group, taskType, onClose, onAssigned }: {
  partialId: string; sessionId: string; group: string; taskType: "Tarea" | "Trabajo en clase";
  onClose: () => void; onAssigned: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState("Consultando actividades…");
  const [error, setError] = useState("");
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

  async function assign() {
    if (inFlight.current || !target || !templateId) return;
    inFlight.current = true; setBusy("Asignando trabajo…"); setError("");
    try {
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
    <label className="select-field"><span>Actividad aprobada</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={!!busy}><option value="">Selecciona contenido</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version} · {item.timeMode === "Libre" ? "Libre" : `${item.durationMinutes} min`}</option>)}</select></label>
    {!available.length && !busy && <p className="notice">No hay actividades aprobadas para este grado. Créalas en Constructor.</p>}
    {!target && !busy && <p className="notice">El grupo de la sesión no coincide con un catálogo activo.</p>}
    <button className="primary-button" type="button" onClick={() => void assign()} disabled={!!busy || !templateId || !target}>Asignar al grupo</button>
    {error && <p className="notice" role="alert">{error}</p>}
    {busy && <ProgressOverlay title={busy} detail={busy.startsWith("Consultando") ? "Cargamos el repositorio y el catálogo de grupos." : "Creamos una aplicación independiente y actualizamos la sesión."} />}
  </section></div>;
}
