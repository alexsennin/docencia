"use client";

import { useMemo, useState } from "react";

type Group = "Todos" | "1° A" | "1° B" | "2° A" | "2° B" | "3° A" | "3° B";
type Status = "Todos" | "Definitiva" | "Provisional";
type PartialStatus = "Activo" | "Pendiente";

type EvaluationComponent = {
  id: "attendance" | "tasks" | "conduct" | "exam";
  label: string;
  description: string;
  detail: string;
  icon: string;
};

type PartialPeriod = {
  id: string;
  name: string;
  sequence: number;
  status: PartialStatus;
  components: EvaluationComponent[];
};

const groups: Exclude<Group, "Todos">[] = ["1° A", "1° B", "2° A", "2° B", "3° A", "3° B"];
const evaluationComponents: EvaluationComponent[] = [
  { id: "attendance", label: "Asistencias", description: "Presencia por clase", detail: "Registro por fecha y alumno", icon: "✓" },
  { id: "tasks", label: "Tareas", description: "Trabajos en clase y tareas", detail: "Actividades y entregas", icon: "▤" },
  { id: "conduct", label: "Conducta y actitud", description: "Valoración formativa", detail: "Criterios y observaciones", icon: "♡" },
  { id: "exam", label: "Examen", description: "Instrumento del parcial", detail: "Calificación del examen", icon: "⌁" },
];

const initialPartials: PartialPeriod[] = [
  { id: "partial-1", name: "1er parcial", sequence: 1, status: "Activo", components: evaluationComponents },
  { id: "partial-2", name: "2do parcial", sequence: 2, status: "Pendiente", components: evaluationComponents },
];

export default function Home() {
  const [group, setGroup] = useState<Group>("Todos");
  const [status, setStatus] = useState<Status>("Todos");
  const [partials, setPartials] = useState<PartialPeriod[]>(initialPartials);
  const [selectedPartialId, setSelectedPartialId] = useState("partial-1");
  const [isAddingPartial, setIsAddingPartial] = useState(false);
  const [newPartialName, setNewPartialName] = useState("");

  const visibleGroups = useMemo(
    () => (group === "Todos" ? groups : groups.filter((item) => item === group)),
    [group],
  );
  const selectedPartial = partials.find((item) => item.id === selectedPartialId) ?? partials[0];

  function addPartial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newPartialName.trim();
    if (!name) return;
    const nextPartial: PartialPeriod = {
      id: `partial-${Date.now()}`,
      name,
      sequence: partials.length + 1,
      status: "Pendiente",
      components: evaluationComponents,
    };
    setPartials((current) => [...current, nextPartial]);
    setSelectedPartialId(nextPartial.id);
    setNewPartialName("");
    setIsAddingPartial(false);
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

        <nav className="main-nav">
          <a className="nav-item" href="#resumen">
            <span className="nav-icon" aria-hidden="true">⌂</span>
            Resumen
          </a>
          <a className="nav-item" href="#resultados">
            <span className="nav-icon" aria-hidden="true">▤</span>
            Resultados
          </a>
          <a className="nav-item active" href="#parciales" aria-current="page">
            <span className="nav-icon" aria-hidden="true">◫</span>
            Parciales
          </a>
          <a className="nav-item" href="#grupos">
            <span className="nav-icon" aria-hidden="true">◎</span>
            Grupos
          </a>
        </nav>

        <div className="sidebar-footer">
          <span className="secure-dot" aria-hidden="true" />
          <div>
            <strong>Vista docente</strong>
            <span>Resultados privados</span>
          </div>
        </div>
      </aside>

      <section className="workspace" id="resultados">
        <header className="topbar">
          <div>
            <p className="eyebrow">PANEL DOCENTE <span>•</span> EVALUACIÓN</p>
            <h1>Evaluación por parciales</h1>
            <p className="page-description">
              Organiza los periodos y consulta el avance de cada grupo.
            </p>
          </div>
          <div className="teacher-chip" aria-label="Sesión docente">
            <span className="avatar">MN</span>
            <span>
              <strong>Docente</strong>
              <small>Sesión administrativa</small>
            </span>
            <span className="chevron" aria-hidden="true">⌄</span>
          </div>
        </header>

        <section className="partials-section" id="parciales" aria-labelledby="partials-title">
          <div className="section-heading partials-heading">
            <div>
              <p className="eyebrow">PERIODOS ACADÉMICOS</p>
              <h2 id="partials-title">Parciales</h2>
            </div>
            <button className="primary-button" type="button" onClick={() => setIsAddingPartial((current) => !current)}>
              <span aria-hidden="true">＋</span> Nuevo parcial
            </button>
          </div>

          {isAddingPartial && (
            <form className="new-partial-form" onSubmit={addPartial}>
              <label>
                <span>Nombre del parcial</span>
                <input
                  value={newPartialName}
                  onChange={(event) => setNewPartialName(event.target.value)}
                  placeholder="Ej. 3er parcial"
                  autoFocus
                />
              </label>
              <button className="primary-button compact" type="submit">Crear parcial</button>
              <span className="form-note">Se agregará con los cuatro componentes de evaluación.</span>
            </form>
          )}

          <div className="partial-list" role="list" aria-label="Parciales disponibles">
            {partials.map((partial) => (
              <button
                className={`partial-card ${selectedPartialId === partial.id ? "selected" : ""}`}
                key={partial.id}
                type="button"
                onClick={() => setSelectedPartialId(partial.id)}
                role="listitem"
              >
                <span className="partial-number">{partial.sequence}</span>
                <span className="partial-card-copy">
                  <strong>{partial.name}</strong>
                  <small>{partial.components.length} componentes de evaluación</small>
                </span>
                <span className={`partial-status ${partial.status.toLowerCase()}`}>{partial.status}</span>
                <span className="partial-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>

          {selectedPartial && (
            <div className="partial-detail">
              <div className="partial-detail-header">
                <div>
                  <p className="eyebrow">CONFIGURACIÓN DEL PARCIAL</p>
                  <h3>{selectedPartial.name}</h3>
                  <p>La ponderación de cada componente queda disponible para definirla más adelante.</p>
                </div>
                <span className="weight-total">Ponderación total <strong>Por definir</strong></span>
              </div>

              <div className="component-grid">
                {selectedPartial.components.map((component) => (
                  <article className="component-card" key={component.id}>
                    <div className={`component-icon ${component.id}`} aria-hidden="true">{component.icon}</div>
                    <div className="component-copy">
                      <h4>{component.label}</h4>
                      <p>{component.description}</p>
                      <span>{component.detail}</span>
                    </div>
                    <span className="component-weight">Peso pendiente</span>
                  </article>
                ))}
              </div>

              <div className="partial-capture">
                <div>
                  <strong>Captura por grupo</strong>
                  <span>Cada componente se podrá registrar por alumno dentro del grupo.</span>
                </div>
                <span className="schema-note">EVALUACIONES · lista para conectar</span>
              </div>
            </div>
          )}
        </section>

        <section className="filters-panel" aria-label="Filtros de resultados">
          <div className="filter-heading">
            <span className="filter-icon" aria-hidden="true">≡</span>
            <div>
              <strong>Filtrar consulta</strong>
              <span>Selecciona el alcance del reporte</span>
            </div>
          </div>

          <label className="select-field">
            <span>Examen</span>
            <select defaultValue="todos" disabled aria-label="Examen">
              <option value="todos">Todos los exámenes</option>
            </select>
          </label>

          <label className="select-field">
            <span>Grupo</span>
            <select value={group} onChange={(event) => setGroup(event.target.value as Group)} aria-label="Grupo">
              <option value="Todos">Todos los grupos</option>
              {groups.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="select-field">
            <span>Estado</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as Status)} aria-label="Estado">
              <option value="Todos">Todos los estados</option>
              <option value="Definitiva">Definitiva</option>
              <option value="Provisional">Provisional</option>
            </select>
          </label>
        </section>

        <section className="metric-grid" aria-label="Resumen del reporte">
          <article className="metric-card">
            <div className="metric-icon mint" aria-hidden="true">✓</div>
            <div><span>Exámenes aplicados</span><strong>0</strong></div>
            <small>En el periodo actual</small>
          </article>
          <article className="metric-card">
            <div className="metric-icon blue" aria-hidden="true">◎</div>
            <div><span>Alumnos evaluados</span><strong>0</strong></div>
            <small>Con resultado registrado</small>
          </article>
          <article className="metric-card">
            <div className="metric-icon amber" aria-hidden="true">⌁</div>
            <div><span>Promedio general</span><strong>—</strong></div>
            <small>Se calculará al recibir resultados</small>
          </article>
          <article className="metric-card">
            <div className="metric-icon violet" aria-hidden="true">◷</div>
            <div><span>Evaluaciones pendientes</span><strong>—</strong></div>
            <small>Sin resultados registrados</small>
          </article>
        </section>

        <section className="group-section" id="grupos" aria-labelledby="groups-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SEGUIMIENTO</p>
              <h2 id="groups-title">Resumen de grupos</h2>
            </div>
            <span className="result-count">{visibleGroups.length} grupos</span>
          </div>

          <div className="group-grid">
            {visibleGroups.map((item) => (
              <article className="group-card" key={item}>
                <div className="group-card-head">
                  <div className="group-badge">{item.replace("° ", "")}</div>
                  <span className="empty-status">Sin resultados</span>
                </div>
                <h3>{item}</h3>
                <div className="progress-row"><span>Avance de evaluación</span><strong>0%</strong></div>
                <div className="progress-track"><span style={{ width: "0%" }} /></div>
                <dl className="group-stats">
                  <div><dt>Aplicados</dt><dd>0</dd></div>
                  <div><dt>Promedio</dt><dd>—</dd></div>
                  <div><dt>Pendientes</dt><dd>—</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="results-section" aria-labelledby="results-title">
          <div className="section-heading results-heading">
            <div>
              <p className="eyebrow">DETALLE</p>
              <h2 id="results-title">Resultados de alumnos</h2>
            </div>
            <button className="export-button" type="button" disabled aria-disabled="true">
              <span aria-hidden="true">⇩</span> Exportar reporte
            </button>
          </div>

          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true"><span>▥</span></div>
            <h3>Aún no hay resultados para mostrar</h3>
            <p>
              Cuando se aplique un examen y se registren sus calificaciones, aquí podrás consultar el resultado por alumno, grupo y estado.
            </p>
            <span className="data-source">Fuente preparada: CALIFICACIONES en Google Sheets</span>
          </div>
        </section>

        <footer className="workspace-footer">
          <span>Los resultados sólo son visibles para el acceso docente.</span>
          <span>Docencia · IntegraTech</span>
        </footer>
      </section>
    </main>
  );
}
