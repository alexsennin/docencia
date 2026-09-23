"use client";

import { useMemo, useState } from "react";

type Group = "Todos" | "1° A" | "1° B" | "2° A" | "2° B" | "3° A" | "3° B";
type Status = "Todos" | "Definitiva" | "Provisional";

const groups: Exclude<Group, "Todos">[] = ["1° A", "1° B", "2° A", "2° B", "3° A", "3° B"];

export default function Home() {
  const [group, setGroup] = useState<Group>("Todos");
  const [status, setStatus] = useState<Status>("Todos");

  const visibleGroups = useMemo(
    () => (group === "Todos" ? groups : groups.filter((item) => item === group)),
    [group],
  );

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
          <a className="nav-item active" href="#resultados" aria-current="page">
            <span className="nav-icon" aria-hidden="true">▤</span>
            Resultados
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
            <h1>Resultados por grupo</h1>
            <p className="page-description">
              Consulta el avance de cada grupo y revisa las calificaciones de sus exámenes.
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
            <small>Sin examen publicado todavía</small>
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
