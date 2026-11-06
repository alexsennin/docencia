"use client";

import type { ReactNode } from "react";

type PendingReview = {
  attemptId: string;
  studentId: string;
  studentName?: string;
  examName: string;
  status: string;
};

type GroupAverage = {
  group: string;
  average: number | null;
  evaluated: number;
  total: number;
  basis?: "final" | "ec" | "none";
};

type LowestStudent = {
  grade: {
    studentId: string;
    group: string;
    final10?: number | null;
    ec?: number | null;
  };
  score: number;
  basis: "final" | "ec";
  name: string;
};

type AcademicDashboardViewProps = {
  partialName: string;
  pendingExamReviews: PendingReview[];
  groupAverages: GroupAverage[];
  lowestStudents: LowestStudent[];
  showPendingExams: boolean;
  onShowPendingExams: (show: boolean) => void;
};

export function AcademicDashboardView({
  partialName,
  pendingExamReviews,
  groupAverages,
  lowestStudents,
  showPendingExams,
  onShowPendingExams,
}: AcademicDashboardViewProps): ReactNode {
  return (
    <div className="teacher-dashboard-content">
      <button
        className="pending-review-card"
        type="button"
        onClick={() => onShowPendingExams(true)}
      >
        <span className="pending-review-icon" aria-hidden="true">
          ◷
        </span>
        <span>
          <strong>Tareas pendientes de revisar</strong>
          <small>Exámenes con respuestas abiertas pendientes de revisión</small>
        </span>
        <b>{pendingExamReviews.length}</b>
      </button>

      <section className="dashboard-group-section" aria-labelledby="dashboard-groups-title">
        <div className="academic-matrix-header">
          <div>
            <p className="eyebrow">RESUMEN DEL PARCIAL</p>
            <h2 id="dashboard-groups-title">Promedio por grupo</h2>
          </div>
          <span className="result-count">{partialName}</span>
        </div>
        <div className="dashboard-group-grid">
          {groupAverages.map((item) => (
            <article className="dashboard-group-card" key={item.group}>
              <span>{item.group}</span>
              <strong>{item.average === null ? "—" : item.average.toFixed(1)}</strong>
              <small>
                {item.evaluated} de {item.total} alumnos {item.basis === "ec" ? "con eval. continua" : "con calificación final"}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-ranking" aria-labelledby="dashboard-ranking-title">
        <div className="academic-matrix-header">
          <div>
            <p className="eyebrow">ATENCIÓN DOCENTE</p>
            <h2 id="dashboard-ranking-title">10 promedios más bajos</h2>
          </div>
          <span className="result-count">
            {lowestStudents.some((s) => s.basis === "ec") ? "Basado en evaluación continua" : "Escala de 10"}
          </span>
        </div>
        {lowestStudents.length ? (
          <ol>
            {lowestStudents.map(({ grade, name, score, basis }) => (
              <li key={`${grade.studentId}:${grade.group}`}>
                <span>
                  <strong>{name}</strong>
                  <small>
                    {grade.group} · {basis === "ec" ? "Evaluación continua" : "Promedio final"}
                  </small>
                </span>
                <b>{score.toFixed(1)}</b>
              </li>
            ))}
          </ol>
        ) : (
          <p className="dashboard-empty">Todavía no hay actividades ni calificaciones registradas para este parcial.</p>
        )}
      </section>

      {showPendingExams && (
        <div
          className="academic-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onShowPendingExams(false);
          }}
        >
          <section
            className="academic-dialog pending-exam-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-exams-title"
          >
            <button
              className="dialog-close"
              type="button"
              aria-label="Cerrar"
              onClick={() => onShowPendingExams(false)}
            >
              ×
            </button>
            <p className="eyebrow">SOLO INFORMATIVO · {partialName}</p>
            <h3 id="pending-exams-title">Exámenes pendientes de revisión</h3>
            {pendingExamReviews.length ? (
              <ul>
                {pendingExamReviews.map((item) => (
                  <li key={item.attemptId}>
                    <strong>{item.studentName || item.studentId}</strong>
                    <span>
                      {item.examName} · {item.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No hay exámenes pendientes de revisar en este parcial.</p>
            )}
            <button
              className="secondary-button"
              type="button"
              onClick={() => onShowPendingExams(false)}
            >
              Cerrar
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
