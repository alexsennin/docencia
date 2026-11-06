"use client";

import type { ReactNode } from "react";

type Row = Record<string, string | number | boolean | null | undefined>;
type TaskKind = "Tarea" | "Trabajo en clase";

const str = (row: Row, key: string) => String(row[key] ?? "");
const numeric = (row: Row, key: string) => (row[key] === "" || row[key] === null || row[key] === undefined ? "" : String(row[key]));

const taskMaximum = (task: Row) => {
  const maximum = Number(task.puntaje_maximo);
  return Number.isFinite(maximum) && maximum > 0 ? maximum : 10;
};

const taskScoreOnTen = (score: unknown, task: Row) => {
  const value = Number(score);
  return Number.isFinite(value) ? Number(Math.max(0, Math.min(10, (value / taskMaximum(task)) * 10)).toFixed(2)) : 0;
};

const formatTaskScore = (score: unknown, task: Row) => String(taskScoreOnTen(score, task));

function attendanceLetter(value: unknown): "P" | "I" | "R" | "" {
  const state = String(value ?? "").trim().toLowerCase();
  if (["p", "asistio", "asistió", "asistencia", "presente"].includes(state)) return "P";
  if (["i", "no_asistio", "inasistencia", "falta", "faltó", "falto"].includes(state)) return "I";
  if (["r", "retardo", "retardó", "retardado"].includes(state)) return "R";
  return "";
}

const reportList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [value];
  } catch {
    return [value];
  }
};

type AcademicStudentDetailDialogProps = {
  detailStudent: Row;
  partialId: string;
  partialName: string;
  group: string;
  sessions: Row[];
  conduct: Row[];
  absences: Row[];
  tasks: Row[];
  taskScores: Row[];
  detailReports: Row[];
  today: string;
  busy: boolean;
  onClose: () => void;
  onGenerateAiReport: () => void;
  onPublishAiReport: (reportId: string) => void;
};

export function AcademicStudentDetailDialog({
  detailStudent,
  partialId,
  partialName,
  group,
  sessions,
  conduct,
  absences,
  tasks,
  taskScores,
  detailReports,
  today,
  busy,
  onClose,
  onGenerateAiReport,
  onPublishAiReport,
}: AcademicStudentDetailDialogProps): ReactNode {
  const studentId = str(detailStudent, "id");
  const studentName = str(detailStudent, "nombre");

  const filteredSessions = sessions
    .filter(
      (session) =>
        str(session, "parcial_id") === partialId &&
        str(session, "grupo") === group &&
        str(session, "estado") !== "Cancelada" &&
        str(session, "fecha_clase") <= today,
    )
    .sort((a, b) => str(a, "fecha_clase").localeCompare(str(b, "fecha_clase")));

  return (
    <div
      className="academic-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="academic-dialog grade-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-detail-title"
      >
        <button className="dialog-close" type="button" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">
          {partialName} · {group}
        </p>
        <h3 id="grade-detail-title">{studentName}</h3>
        <p className="grade-detail-subtitle">
          ID {studentId} · Detalle de sesiones, asistencia y actividades
        </p>

        <div className="matrix-scroll">
          <table className="academic-matrix grade-detail-table">
            <thead>
              <tr>
                <th>Sesión (día)</th>
                <th>Asistencia</th>
                <th>Comentario</th>
                <th>Trabajos en clase</th>
                <th>Tareas</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => {
                const sid = str(session, "sesion_id");
                const caRows = conduct.filter(
                  (row) =>
                    str(row, "sesion_id") === sid &&
                    str(row, "alumno_id").toUpperCase() === studentId.toUpperCase() &&
                    str(row, "estado") !== "Anulada",
                );
                const note = caRows.find((row) => ["Anotacion", "Anotación"].includes(str(row, "tipo")));
                const attendance = absences.find(
                  (row) =>
                    str(row, "sesion_id") === sid &&
                    str(row, "alumno_id").toUpperCase() === studentId.toUpperCase(),
                );
                const activities = tasks.filter(
                  (task) =>
                    str(task, "parcial_id") === partialId &&
                    str(task, "grupo") === group &&
                    String(task.activa).toUpperCase() !== "FALSE" &&
                    (str(task, "sesion_calificacion_id") === sid ||
                      (str(task, "tipo") === "Trabajo en clase" && str(task, "sesion_id") === sid)),
                );

                const renderActivities = (kind: TaskKind) => {
                  const matches = activities.filter((task) => str(task, "tipo") === kind);
                  if (!matches.length) return <span>—</span>;
                  return (
                    <ul className="grade-detail-activities">
                      {matches.map((task) => {
                        const result = taskScores.find(
                          (row) =>
                            str(row, "tarea_id") === str(task, "tarea_id") &&
                            str(row, "alumno_id").toUpperCase() === studentId.toUpperCase(),
                        );
                        const state = str(result ?? {}, "estado");
                        const score = numeric(result ?? {}, "puntaje");
                        const resultText =
                          score !== ""
                            ? `${formatTaskScore(score, task)}/10`
                            : state === "Justificada" || state === "Excluida"
                              ? "Justificada"
                              : "0/10";
                        return (
                          <li key={str(task, "tarea_id")}>
                            <span>{str(task, "nombre")}</span>
                            <small>{resultText}</small>
                          </li>
                        );
                      })}
                    </ul>
                  );
                };

                const attendanceStatus = attendanceLetter(attendance?.estado);
                return (
                  <tr key={sid}>
                    <th>{str(session, "fecha_clase")}</th>
                    <td>{attendanceStatus}</td>
                    <td>{str(note ?? {}, "observacion") || "—"}</td>
                    <td>{renderActivities("Trabajo en clase")}</td>
                    <td>{renderActivities("Tarea")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className="grade-detail-reports" aria-labelledby="academic-report-title">
          <div className="academic-matrix-header">
            <div>
              <p className="eyebrow">REVISIÓN DOCENTE · {partialName}</p>
              <h4 id="academic-report-title">Retroalimentación académica</h4>
              <p>La IA prepara una propuesta basada en los registros del parcial. Revísala antes de compartirla.</p>
            </div>
            <button
              className="primary-button compact"
              type="button"
              onClick={onGenerateAiReport}
              disabled={busy || !partialId}
            >
              Evaluar
            </button>
          </div>

          {detailReports.length ? (
            <div className="grade-report-list">
              {detailReports.map((report) => {
                const strengths = reportList(report.fortalezas);
                const opportunities = reportList(report.areas_oportunidad);
                const recommendations = reportList(report.recomendaciones_json);
                const pending = str(report, "estado") === "Pendiente_revision_docente";
                const reportId = str(report, "reporte_id");
                return (
                  <article className="grade-report-card" key={reportId}>
                    <div className="grade-report-heading">
                      <span className="eyebrow">
                        {pending ? "PENDIENTE DE REVISIÓN" : str(report, "estado") || "REPORTE"}
                      </span>
                      <small>
                        {str(report, "created_at")
                          ? new Date(str(report, "created_at")).toLocaleDateString("es-MX")
                          : ""}
                      </small>
                    </div>
                    <p>{str(report, "resumen")}</p>
                    {strengths.length > 0 && (
                      <div>
                        <strong>Fortalezas</strong>
                        <ul>
                          {strengths.map((item, index) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {opportunities.length > 0 && (
                      <div>
                        <strong>Áreas de oportunidad</strong>
                        <ul>
                          {opportunities.map((item, index) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {recommendations.length > 0 && (
                      <div>
                        <strong>Recomendaciones</strong>
                        <ul>
                          {recommendations.map((item, index) => (
                            <li key={`${index}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {pending && (
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => onPublishAiReport(reportId)}
                        disabled={busy}
                      >
                        Aprobar y compartir
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="session-hint">Aún no hay propuestas para este alumno en el parcial.</p>
          )}
        </section>

        <button className="secondary-button" type="button" onClick={onClose}>
          Cerrar
        </button>
      </section>
    </div>
  );
}
