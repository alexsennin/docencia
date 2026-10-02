"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminExamControls } from "./admin-exam-controls";
import { TeacherGeminiSettings } from "./teacher-gemini-settings";
import { TeacherAcademicModule } from "./teacher-academic-module";
import { TeacherCaRubric } from "./teacher-ca-rubric";
import { TeacherExamAuthoring } from "./teacher-exam-authoring";
import { TeacherExamGradeMatrix } from "./teacher-exam-grade-matrix";
import { ProgressOverlay } from "./progress-overlay";

type Group = "Todos" | "1° A" | "1° B" | "2° A" | "2° B" | "3° A" | "3° B";
type Status = "Todos" | "Definitiva" | "Provisional";
type SectionId = "dashboard" | "clases" | "archivados" | "calificaciones" | "rubrica-ca" | "examenes" | "matriz-examenes";
type ExamView = "constructor" | "revocador";
type ExamReport = { attemptId: string; studentId: string; studentName: string; grade: string; group: string; examId: string; examName: string; partialId: string; status: string; score: number | null; grade10: number | null; automaticScore: number | null; aiPending: boolean; submittedAt: string; answers: Array<{ questionId: string; answer: string; score: number | null; feedback: string; status: string }> };
type PartialOption = { id: string; name: string };

const groups: Exclude<Group, "Todos">[] = ["1° A", "1° B", "2° A", "2° B", "3° A", "3° B"];
const sections: Array<{ id: SectionId; label: string; icon: string; description: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "⌂", description: "Pendientes de revisión y promedio del parcial por grupo." },
  { id: "clases", label: "Clases", icon: "◫", description: "Administra sesiones, asistencia, conducta y actividades." },
  { id: "rubrica-ca", label: "Conducta y Act.", icon: "▧", description: "Genera y revisa la rúbrica de conducta y actitud de cada alumno." },
  { id: "calificaciones", label: "Calificaciones", icon: "▦", description: "Consulta el promedio del parcial y el detalle académico de cada alumno." },
  { id: "matriz-examenes", label: "Exámenes", icon: "▤", description: "Consulta las calificaciones registradas por alumno y pregunta." },
  { id: "examenes", label: "Constructor", icon: "▤", description: "Crea exámenes y administra intentos entregados." },
  { id: "archivados", label: "Archivados", icon: "▱", description: "Consulta las sesiones, tareas y trabajos retirados de los cálculos activos." },
];

export default function Home() {
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [visitedSections, setVisitedSections] = useState<Set<SectionId>>(() => new Set(["dashboard"]));
  const [examView, setExamView] = useState<ExamView>("constructor");
  const [group, setGroup] = useState<Group>("Todos");
  const [status, setStatus] = useState<Status>("Todos");
  const [reports, setReports] = useState<ExamReport[]>([]);
  const [reportError, setReportError] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [examFilter, setExamFilter] = useState("todos");
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [detailReportsOpen, setDetailReportsOpen] = useState(false);
  const [reevaluatingQuestion, setReevaluatingQuestion] = useState<string | null>(null);
  const [reevaluationMessage, setReevaluationMessage] = useState("");
  const [academicPartials, setAcademicPartials] = useState<PartialOption[]>([]);
  const [selectedPartialId, setSelectedPartialId] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem("docencia.teacher.selectedPartialId") || "");
  const [geminiSettingsOpen, setGeminiSettingsOpen] = useState(false);
  const reevaluationInFlight = useRef(false);
  const [createPartialOpen, setCreatePartialOpen] = useState(false);
  const [newPartialName, setNewPartialName] = useState("");
  const [newPartialCycle, setNewPartialCycle] = useState("2026-2027");
  const [createPartialError, setCreatePartialError] = useState("");
  const [creatingPartial, setCreatingPartial] = useState(false);
  const createPartialInFlight = useRef(false);

  useEffect(() => {
    if (selectedPartialId) window.localStorage.setItem("docencia.teacher.selectedPartialId", selectedPartialId);
  }, [selectedPartialId]);

  useEffect(() => {
    if (activeSection !== "examenes" || examView !== "revocador" || !detailReportsOpen) return;
    let cancelled = false;
    async function load() {
      setReportLoading(true); setReportError("");
      try {
        const response = await fetch("/api/teacher/results", { cache: "no-store" });
        const data = await response.json() as { results?: ExamReport[]; error?: string };
        if (!response.ok) throw new Error(data.error || "No se pudo consultar el reporte.");
        if (!cancelled) setReports(Array.isArray(data.results) ? data.results : []);
      } catch (cause) { if (!cancelled) setReportError(cause instanceof Error ? cause.message : "No se pudo consultar el reporte."); }
      finally { if (!cancelled) setReportLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [activeSection, examView, detailReportsOpen]);

  const exams = useMemo(() => Array.from(new Map(reports.map((item) => [item.examId, item.examName])).entries()), [reports]);
  const filteredReports = useMemo(() => reports.filter((item) => item.partialId === selectedPartialId && (group === "Todos" || `${item.grade} ${item.group}` === group || item.group === group) && (status === "Todos" || (status === "Definitiva" ? item.status === "Definitivo" : item.status === "Provisional")) && (examFilter === "todos" || item.examId === examFilter)), [reports, selectedPartialId, group, status, examFilter]);
  const detail = reports.find((item) => item.attemptId === selectedAttempt);
  const currentSection = sections.find((item) => item.id === activeSection) ?? sections[0];
  function navigateSection(section: SectionId) {
    setActiveSection(section);
    setVisitedSections((visited) => new Set(visited).add(section));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function reevaluateAnswer(attemptId: string, questionId: string) {
    if (reevaluationInFlight.current) return;
    reevaluationInFlight.current = true;
    setReevaluatingQuestion(`${attemptId}:${questionId}`);
    setReevaluationMessage("");
    try {
      const response = await fetch("/api/teacher/results/reevaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId, questionId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo re-evaluar el reactivo.");

      const refresh = await fetch("/api/teacher/results", { cache: "no-store" });
      const updated = await refresh.json() as { results?: ExamReport[]; error?: string };
      if (!refresh.ok) throw new Error(updated.error || "La evaluación se guardó, pero no se pudo actualizar el reporte.");
      setReports(Array.isArray(updated.results) ? updated.results : []);
      setSelectedAttempt(attemptId);
      setReevaluationMessage("Evaluación guardada; se actualizó el resultado del examen y del parcial.");
    } catch (cause) {
      setReevaluationMessage(cause instanceof Error ? cause.message : "No se pudo re-evaluar el reactivo.");
    } finally {
      reevaluationInFlight.current = false;
      setReevaluatingQuestion(null);
    }
  }

  async function createPartial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPartialInFlight.current) return;
    createPartialInFlight.current = true;
    setCreatingPartial(true);
    setCreatePartialError("");
    try {
      const response = await fetch("/api/teacher/academic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createPartial", payload: { name: newPartialName, cycle: newPartialCycle } }),
      });
      const data = await response.json() as {
        result?: { partialId?: string };
        snapshot?: { partials?: Array<{ parcial_id?: string; nombre?: string }> };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "No se pudo crear el parcial.");
      const options = (data.snapshot?.partials ?? [])
        .map((partial) => ({ id: String(partial.parcial_id ?? ""), name: String(partial.nombre ?? "") }))
        .filter((partial) => partial.id && partial.name);
      setAcademicPartials(options);
      if (!data.result?.partialId) throw new Error("El parcial se guardó, pero no se recibió su identificador para actualizar la vista.");
      setSelectedPartialId(data.result.partialId);
      setSelectedAttempt(null);
      setNewPartialName("");
      setCreatePartialOpen(false);
    } catch (cause) {
      setCreatePartialError(cause instanceof Error ? cause.message : "No se pudo crear el parcial.");
    } finally {
      createPartialInFlight.current = false;
      setCreatingPartial(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegación docente">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">D</div>
          <div>
            <strong>Docencia</strong>
            <span>Instituto Santa María</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Secciones del panel docente">
          {sections.map((item) => <button className={`nav-item${activeSection === item.id ? " active" : ""}`} type="button" key={item.id} aria-current={activeSection === item.id ? "page" : undefined} onClick={() => navigateSection(item.id)}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
          </button>)}
        </nav>

        <div className="sidebar-footer">
          <span className="secure-dot" aria-hidden="true" />
          <div>
            <strong>Vista docente</strong>
            <span>Resultados privados</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">PANEL DOCENTE <span>•</span> {currentSection.label.toLocaleUpperCase("es-MX")}</p>
            <h1>{currentSection.label}</h1>
            <p className="page-description">{currentSection.description}</p>
          </div>
          <div className="teacher-header-tools">
            <div className="teacher-chip" aria-label="Sesión docente">
              <span className="avatar">MN</span>
              <span>
                <strong>Docente</strong>
                <small>Sesión administrativa</small>
              </span>
              <form action="/api/teacher/logout" method="post">
                <button className="teacher-logout" type="submit">Salir</button>
              </form>
            </div>
            <div className="partial-selector-row">
              <label className="topbar-partial-select"><span>Parcial actual</span><select aria-label="Parcial actual" value={selectedPartialId} onChange={(event) => { setSelectedPartialId(event.target.value); setSelectedAttempt(null); }} disabled={!academicPartials.length}><option value="">{academicPartials.length ? "Selecciona un parcial" : "Cargando parciales…"}</option>{academicPartials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button className="secondary-button compact" type="button" onClick={() => { setCreatePartialError(""); setCreatePartialOpen(true); }}>Nuevo parcial</button>
            </div>
          </div>
        </header>

        {(visitedSections.has("dashboard") || visitedSections.has("clases") || visitedSections.has("archivados") || visitedSections.has("calificaciones")) && <section className="dashboard-section" id="seccion-academica" aria-label={activeSection === "clases" ? "Clases" : activeSection === "archivados" ? "Archivados" : activeSection === "calificaciones" ? "Calificaciones" : "Dashboard"} hidden={activeSection !== "dashboard" && activeSection !== "clases" && activeSection !== "archivados" && activeSection !== "calificaciones"}>
          <TeacherAcademicModule active mode={activeSection === "clases" ? "clases" : activeSection === "archivados" ? "archivados" : activeSection === "calificaciones" ? "calificaciones" : "dashboard"} partialId={selectedPartialId} onPartialChange={setSelectedPartialId} onPartialsChange={setAcademicPartials} />
        </section>}

        {visitedSections.has("rubrica-ca") && <section className="dashboard-section" id="seccion-rubrica-ca" aria-label="Conducta y Act." hidden={activeSection !== "rubrica-ca"}>
          <TeacherCaRubric active={activeSection === "rubrica-ca"} partialId={selectedPartialId} />
        </section>}

        {visitedSections.has("examenes") && <section className="dashboard-section" id="seccion-constructor" aria-label="Constructor y revocador de exámenes" hidden={activeSection !== "examenes"}>
          <nav className="academic-view-tabs exam-view-tabs" aria-label="Herramientas de exámenes">
            <button type="button" className={examView === "constructor" ? "active" : ""} aria-current={examView === "constructor" ? "page" : undefined} onClick={() => setExamView("constructor")}>Constructor</button>
            <button type="button" className={examView === "revocador" ? "active" : ""} aria-current={examView === "revocador" ? "page" : undefined} onClick={() => setExamView("revocador")}>Revocador</button>
          </nav>
          {examView === "constructor" && <>
            <div className="student-access-banner">
              <div><strong>Probar exámenes como docente</strong><span>La simulación no crea intentos ni modifica calificaciones de alumnos.</span></div>
              <a className="primary-button" href="/docente/probar">Abrir espacio de pruebas</a>
            </div>
            <TeacherExamAuthoring active={activeSection === "examenes" && examView === "constructor"} partialId={selectedPartialId} />
            <details className="exam-secondary-tools" onToggle={(event) => setGeminiSettingsOpen(event.currentTarget.open)}><summary>Configuración de IA</summary>{geminiSettingsOpen && <TeacherGeminiSettings active={activeSection === "examenes" && examView === "constructor"} />}</details>
          </>}
          {examView === "revocador" && <>
            <AdminExamControls active={activeSection === "examenes" && examView === "revocador"} partialId={selectedPartialId} />
            <details className="exam-secondary-tools" onToggle={(event) => setDetailReportsOpen(event.currentTarget.open)}><summary>Consultar resultados y respuestas</summary>
              <section className="filters-panel" aria-label="Filtros de resultados">
                <label className="select-field"><span>Examen</span><select value={examFilter} onChange={(event) => setExamFilter(event.target.value)}><option value="todos">Todos los exámenes</option>{exams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                <label className="select-field"><span>Grupo</span><select value={group} onChange={(event) => setGroup(event.target.value as Group)}><option value="Todos">Todos los grupos</option>{groups.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label className="select-field"><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value as Status)}><option value="Todos">Todos los estados</option><option value="Definitiva">Definitiva</option><option value="Provisional">Provisional</option></select></label>
              </section>
              {reportLoading && <p className="notice" role="status">Consultando resultados guardados…</p>}{reportError && <p className="notice" role="alert">{reportError}</p>}
              {!reportLoading && !reportError && filteredReports.length > 0 && <div className="report-list">{filteredReports.map((item) => <button className="report-row" key={item.attemptId} type="button" onClick={() => setSelectedAttempt(item.attemptId)}><span><strong>{item.studentName}</strong><small>{item.grade} {item.group} · {item.examName}</small></span><span>{item.status}</span><b>{item.grade10 === null ? "Pendiente" : `${item.grade10} / 10`}</b></button>)}</div>}
              {reevaluationMessage && <p className="notice" role="status">{reevaluationMessage}</p>}
              {detail && <div className="report-detail" role="dialog" aria-label="Desglose del examen"><button className="text-button" type="button" onClick={() => setSelectedAttempt(null)}>Cerrar detalle</button><h3>{detail.studentName} · {detail.examName}</h3><p>{detail.status} · {detail.grade10 === null ? "Calificación pendiente" : `${detail.grade10} / 10`}</p><div className="result-items">{detail.answers.map((item) => { const pendingAi = item.status.toLowerCase() === "pendiente"; const reevaluationKey = `${detail.attemptId}:${item.questionId}`; return <div className="result-item" key={item.questionId}><strong>{item.questionId}</strong><span>{item.status}</span><b>{item.score === null ? "Pendiente" : `${item.score} puntos`}</b><small>Respuesta: {item.answer || "Sin respuesta"}</small><small>{item.feedback}</small>{detail.status === "Provisional" && pendingAi && item.answer.trim() && <button className="secondary-button" type="button" onClick={() => void reevaluateAnswer(detail.attemptId, item.questionId)} disabled={!!reevaluatingQuestion}>{reevaluatingQuestion === reevaluationKey ? "Re-evaluando…" : "Re-evaluar con IA"}</button>}</div>; })}</div></div>}
              {!reportLoading && !reportError && filteredReports.length === 0 && <p className="empty-state">No hay resultados con estos filtros.</p>}
            </details>
          </>}
        </section>}

        {visitedSections.has("matriz-examenes") && <section className="dashboard-section" id="seccion-matriz-examenes" aria-label="Exámenes por grado y grupo" hidden={activeSection !== "matriz-examenes"}>
          <TeacherExamGradeMatrix active={activeSection === "matriz-examenes"} partialId={selectedPartialId} partialName={academicPartials.find((item) => item.id === selectedPartialId)?.name ?? ""} />
        </section>}

        <footer className="workspace-footer">
          <span>Los resultados sólo son visibles para el acceso docente.</span>
          <span>Docencia · IntegraTech</span>
        </footer>
        {reportLoading && activeSection === "examenes" && examView === "revocador" && detailReportsOpen && <ProgressOverlay title="Consultando resultados…" detail="Cargamos resultados y respuestas del parcial seleccionado." />}
        {reevaluatingQuestion && <ProgressOverlay title="Re-evaluando respuesta con IA…" detail="Gemini revisa la respuesta con la rúbrica; después guardamos la nota y actualizamos el examen y el parcial." />}
        {creatingPartial && <ProgressOverlay title="Creando parcial…" detail="Guardamos el nuevo parcial, registramos la auditoría y actualizamos la matriz académica." />}
        {createPartialOpen && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingPartial) setCreatePartialOpen(false); }}>
          <section className="academic-dialog create-partial-dialog" role="dialog" aria-modal="true" aria-labelledby="create-partial-title">
            <button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setCreatePartialOpen(false)} disabled={creatingPartial}>×</button>
            <p className="eyebrow">CONFIGURACIÓN ACADÉMICA</p>
            <h3 id="create-partial-title">Crear parcial</h3>
            <p>El parcial quedará disponible para registrar clases, actividades y calificaciones.</p>
            <form className="academic-form" onSubmit={(event) => void createPartial(event)}>
              <label><span>Nombre del parcial</span><input autoFocus required maxLength={80} value={newPartialName} onChange={(event) => setNewPartialName(event.target.value)} placeholder="Ej. Segundo parcial" /></label>
              <label><span>Ciclo escolar</span><input required maxLength={30} value={newPartialCycle} onChange={(event) => setNewPartialCycle(event.target.value)} /></label>
              {createPartialError && <p className="notice" role="alert">{createPartialError}</p>}
              <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setCreatePartialOpen(false)} disabled={creatingPartial}>Cancelar</button><button className="primary-button" type="submit" disabled={creatingPartial || !newPartialName.trim() || !newPartialCycle.trim()}>Crear parcial</button></div>
            </form>
          </section>
        </div>}
      </section>
    </main>
  );
}
