"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CONDUCT_ATTITUDE_CRITERIA } from "../lib/conduct-attitude-rubric";
import { ProgressOverlay } from "./progress-overlay";
import { CaRubricMatrix } from "./ca-rubric-matrix";

type Row = Record<string, string | number | boolean | null | undefined>;
type Snapshot = { partials: Row[]; students: Row[]; conduct: Row[] };
type AcademicData = { snapshot: Snapshot; error?: string };
type Criterion = { criterio: string; puntuacion: number; evidencias: string[]; justificacion: string };
type Job = { id: string; partialId: string; group?: string; grade: string; status: string; total: number; completed: number; failureCount: number; lastError?: string };
const field = (row: Row | undefined, key: string) => String(row?.[key] ?? "");
const same = (a: unknown, b: unknown) => String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
function criteriaOf(record: Row | undefined): Criterion[] {
  try { const value: unknown = JSON.parse(field(record, "rubrica_criterios_json")); return Array.isArray(value) && value.length === 5 ? value : []; } catch { return []; }
}
async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo completar la operación.");
  return body as T;
}

export function TeacherCaRubric({ active, partialId }: { active: boolean; partialId: string }) {
  const [data, setData] = useState<AcademicData | null>(null);
  const [group, setGroup] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState<{ title: string; detail: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let previousJob = "";
    async function refresh(initial = false) {
      try {
        if (initial) setBusy({ title: "Cargando rúbrica…", detail: "Consultamos grupos, comentarios y calificaciones guardadas." });
        const { job: initialJob, backend } = await readJson<{ job: Job | null; backend: "postgres" | "sheets" }>(`/api/teacher/ca-rubric-job?partialId=${encodeURIComponent(partialId)}`);
        let current = initialJob;
        if (current?.status === "En_proceso" && backend === "postgres") {
          const advanced = await readJson<{ job: Job }>("/api/teacher/ca-rubric-job", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "advance", jobId: current.id }),
          });
          current = advanced.job;
        }
        const revision = `${current?.id}:${current?.completed}:${current?.status}`;
        if (initial || revision !== previousJob) {
          const result = await readJson<AcademicData>("/api/teacher/academic");
          if (!cancelled) setData(result);
        }
        previousJob = revision;
        if (!cancelled) {
          setJob(current);
          if (current?.status === "Completado") setMessage("Evaluación terminada. Las calificaciones se guardaron automáticamente.");
          if (current?.status === "Completado_con_errores") setError(`Se guardaron los resultados válidos; ${current.failureCount} alumno(s) requieren reintento. ${current.lastError || ""}`);
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo consultar el avance."); }
      finally {
        if (!cancelled) { if (initial) setBusy(null); timer = setTimeout(() => void refresh(), 5000); }
      }
    }
    void refresh(true);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, partialId]);

  const groups = useMemo(() => Array.from(new Set(data?.snapshot.students.map((student) => `${field(student, "grado").trim()} ${field(student, "grupo").trim()}`.trim()) ?? []))
    .filter(Boolean).sort((a, b) => a.localeCompare(b, "es-MX", { numeric: true })), [data]);
  const chosenGroup = groups.includes(group) ? group : "";
  const students = useMemo(() => (data?.snapshot.students.filter((student) => `${field(student, "grado").trim()} ${field(student, "grupo").trim()}`.trim() === chosenGroup) ?? [])
    .sort((a, b) => field(a, "nombre").localeCompare(field(b, "nombre"), "es-MX")), [data, chosenGroup]);
  const partialName = field(data?.snapshot.partials.find((partial) => field(partial, "parcial_id") === partialId), "nombre");
  const matrixStudents = students.map((item) => {
    const id = field(item, "id");
    const record = data?.snapshot.conduct.find((entry) => field(entry, "parcial_id") === partialId && same(entry.alumno_id, id) && field(entry, "tipo") === "Rubrica C.A.");
    const current = ["Evaluada_ai", "Aprobada_docente"].includes(field(record, "estado"));
    return { id, name: field(item, "nombre"), scores: current ? criteriaOf(record).map((criterion) => String(criterion.puntuacion)) : [], status: field(record, "estado").replaceAll("_", " ") || "Sin evaluar" };
  });
  const student = students.find((item) => field(item, "id") === selectedId);
  const rubric = data?.snapshot.conduct.find((item) => field(item, "parcial_id") === partialId && same(item.alumno_id, selectedId) && field(item, "tipo") === "Rubrica C.A.");
  const criteria = criteriaOf(rubric);
  const evaluatedTardies = (() => {
    try { const evidence = JSON.parse(field(rubric, "rubrica_evidencias_json")) as { tardies?: { fecha: string }[] }; return Array.isArray(evidence.tardies) ? evidence.tardies : []; } catch { return []; }
  })();
  const evaluating = job?.status === "En_proceso";
  const overlay = busy ?? (evaluating ? { title: "Evaluando conducta y actitud…", detail: `${job.group || job.grade}: ${job.completed} de ${job.total} alumnos procesados. Guardamos automáticamente cada evaluación; puedes retomar el avance al volver.` } : null);

  async function evaluate() {
    if (!partialId || !chosenGroup || inFlight.current || evaluating || busy) return;
    inFlight.current = true;
    setError(""); setMessage("");
    setBusy({ title: "Revisando comentarios…", detail: `Buscamos alumnos sin evaluación o con comentarios o retardos modificados en ${chosenGroup}.` });
    try {
      const body = await readJson<{ job: Job }>("/api/teacher/ca-rubric-job", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partialId, group: chosenGroup }) });
      setJob(body.job);
      if (body.job.status === "Sin_pendientes") setMessage("No hay comentarios nuevos ni evaluaciones pendientes. Las calificaciones guardadas están actualizadas.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo iniciar la evaluación."); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function copyScores() {
    if (inFlight.current || overlay || !matrixStudents.length) return;
    inFlight.current = true;
    try {
      const rows = matrixStudents.map((student) => {
        if (student.scores.length !== 5 || student.scores.some((score) => !Number.isFinite(Number(score)) || Number(score) < 1 || Number(score) > 10)) throw new Error("Evalúa todos los alumnos del grupo antes de copiar las calificaciones.");
        return student.scores.join("\t");
      });
      await navigator.clipboard.writeText(rows.join("\n"));
      setError(""); setMessage("Calificaciones copiadas: únicamente los cinco criterios, sin nombres ni encabezados.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron copiar las calificaciones."); }
    finally { inFlight.current = false; }
  }

  return <section className="academic-module ca-rubric-module" aria-label="Rúbrica Conducta y Actitud">
    <div className="academic-toolbar"><label className="select-field"><span>Grupo</span><select aria-label="Grupo de la rúbrica" value={chosenGroup} onChange={(event) => { setGroup(event.target.value); setSelectedId(""); setMessage(""); }} disabled={!!overlay || !groups.length}><option value="">Selecciona un grupo</option>{groups.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button type="button" className="primary-button compact" onClick={() => void evaluate()} disabled={!!overlay || !partialId || !chosenGroup}>Evaluar</button><button type="button" className="secondary-button compact" onClick={() => void copyScores()} disabled={!!overlay || !matrixStudents.length}>Copiar calificaciones</button></div>
    {error && <p className="notice" role="alert">{error}</p>}{message && <p className="academic-success" role="status">{message}</p>}
    {chosenGroup ? <CaRubricMatrix partialName={partialName} students={matrixStudents} busy={!!overlay} onReview={(id) => setSelectedId(id)} /> : <p className="ca-excel-empty">Selecciona un grupo para cargar la matriz.</p>}
    {selectedId && student && <div className="academic-dialog-backdrop"><section className="academic-dialog ca-rubric-review" role="dialog" aria-modal="true" aria-label={`Evaluación de ${field(student, "nombre")}`}><button className="dialog-close" type="button" aria-label="Cerrar revisión" onClick={() => setSelectedId("")}>×</button><h3>{field(student, "nombre")}</h3><p>Retardos considerados en este parcial: <strong>{evaluatedTardies.length}</strong>{evaluatedTardies.length > 0 && ` · ${evaluatedTardies.map((item) => item.fecha).join(", ")}`}</p><p>{field(rubric, "estado").replaceAll("_", " ") || "Sin evaluar"}</p><div className="matrix-scroll"><table className="academic-matrix"><thead><tr><th>Criterio</th><th>Calificación</th><th>Fundamento</th></tr></thead><tbody>{CONDUCT_ATTITUDE_CRITERIA.map((criterion, index) => <tr key={criterion}><th>{criterion}</th><td>{criteria[index]?.puntuacion ?? "—"}</td><td className="ca-rubric-reason">{criteria[index]?.justificacion || "Pendiente de evaluar"}</td></tr>)}</tbody></table></div></section></div>}
    {overlay && <ProgressOverlay title={overlay.title} detail={overlay.detail} />}
  </section>;
}
