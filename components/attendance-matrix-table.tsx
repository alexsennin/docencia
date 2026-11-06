"use client";

import { useMemo, useState } from "react";

type Row = Record<string, unknown>;

function str(source: Row | null | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" ? value : value ? String(value) : "";
}

function formatSessionDate(dateStr: string) {
  if (!dateStr) return { short: "", dayOfWeek: "" };
  const parts = dateStr.split("-");
  if (parts.length !== 3) return { short: dateStr, dayOfWeek: "" };
  const [year, month, day] = parts.map(Number);
  const d = new Date(year, month - 1, day);
  const dayNames = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const dayOfWeek = dayNames[d.getDay()] ?? "";
  const short = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
  return { short, dayOfWeek };
}

interface AttendanceMatrixTableProps {
  group: string;
  partialName: string;
  students: Row[];
  sessions: Row[];
  absences: Row[];
}

export function AttendanceMatrixTable({
  group,
  partialName,
  students,
  sessions,
  absences,
}: AttendanceMatrixTableProps) {
  const [copied, setCopied] = useState(false);

  // Orden cronológico ascendente de las sesiones (más antigua a más reciente)
  const chronologicalSessions = useMemo(() => {
    return [...sessions]
      .filter((s) => str(s, "fecha_clase") && str(s, "estado") !== "Cancelada")
      .sort((a, b) => str(a, "fecha_clase").localeCompare(str(b, "fecha_clase")));
  }, [sessions]);

  // Alumnos ordenados alfabéticamente por apellidos
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) =>
      str(a, "nombre").localeCompare(str(b, "nombre"), "es-MX")
    );
  }, [students]);

  // Mapa de asistencia para consulta O(1): key = `${alumno_id}:${sesion_id}`
  const attendanceMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of absences) {
      const sId = str(record, "sesion_id");
      const aId = str(record, "alumno_id");
      const rawStatus = str(record, "estado").trim().toUpperCase();
      if (sId && aId) {
        if (["P", "ASISTIO", "ASISTIÓ", "ASISTENCIA", "PRESENTE"].includes(rawStatus)) {
          map.set(`${aId}:${sId}`, "P");
        } else if (["I", "NO_ASISTIO", "INASISTENCIA", "FALTA", "FALTÓ", "FALTO"].includes(rawStatus)) {
          map.set(`${aId}:${sId}`, "I");
        } else if (["R", "RETARDO", "RETARDÓ", "RETARDADO"].includes(rawStatus)) {
          map.set(`${aId}:${sId}`, "R");
        }
      }
    }
    return map;
  }, [absences]);

  // Copiado al portapapeles exclusivo de: Nombre alumno, fechas y celdas de asistencia
  const copyAttendanceTable = async () => {
    if (!chronologicalSessions.length || !sortedStudents.length) return;

    const header = [
      "Nombre alumno",
      ...chronologicalSessions.map((session) => {
        const { short } = formatSessionDate(str(session, "fecha_clase"));
        return short || str(session, "fecha_clase");
      }),
    ].join("\t");

    const rows = sortedStudents.map((student) => {
      const studentId = str(student, "id");
      const studentName = str(student, "nombre");
      const statuses = chronologicalSessions.map((session) => {
        const sessionId = str(session, "sesion_id");
        return attendanceMap.get(`${studentId}:${sessionId}`) || "";
      });
      return [studentName, ...statuses].join("\t");
    });

    const tsv = [header, ...rows].join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="academic-card matrix-card attendance-matrix-section" aria-labelledby="attendance-matrix-title">
      <header className="academic-matrix-header">
        <div>
          <p className="eyebrow">{group} · {partialName}</p>
          <h3 id="attendance-matrix-title">Matriz de asistencia</h3>
          <p className="attendance-legend">
            <span><strong>P</strong>: Asistencia</span>
            <span><strong>I</strong>: Inasistencia</span>
            <span><strong>R</strong>: Retardo</span>
            <span>· Ordenado alfabéticamente por apellidos</span>
          </p>
        </div>
        <div className="session-heading-actions">
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => void copyAttendanceTable()}
            disabled={!sortedStudents.length || !chronologicalSessions.length}
            title="Copia al portapapeles el nombre del alumno, fechas y celdas de asistencia en formato compatible con Excel o Google Sheets"
          >
            {copied ? "✓ ¡Asistencia copiada!" : "📋 Copiar tabla de asistencia"}
          </button>
        </div>
      </header>

      {!sortedStudents.length ? (
        <p className="dashboard-empty">No hay alumnos registrados en este grupo.</p>
      ) : !chronologicalSessions.length ? (
        <p className="dashboard-empty">Aún no hay sesiones registradas para generar la matriz de asistencia.</p>
      ) : (
        <div className="matrix-scroll attendance-matrix-scroll">
          <table className="academic-matrix attendance-matrix-table" aria-label={`Matriz de asistencia ${group}`}>
            <thead>
              <tr>
                <th scope="col" className="sticky-col id-col">ID Alumno</th>
                <th scope="col" className="sticky-col name-col">Nombre alumno</th>
                {chronologicalSessions.map((session) => {
                  const dateStr = str(session, "fecha_clase");
                  const { short, dayOfWeek } = formatSessionDate(dateStr);
                  return (
                    <th key={str(session, "sesion_id")} scope="col" className="attendance-date-col" title={`Sesión del ${dateStr}`}>
                      <div className="attendance-date-box">
                        <span className="attendance-date-short">{short}</span>
                        {dayOfWeek && <span className="attendance-day-label">{dayOfWeek}</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((student) => {
                const studentId = str(student, "id");
                const studentName = str(student, "nombre");
                return (
                  <tr key={studentId}>
                    <td className="sticky-col id-col">{studentId}</td>
                    <th scope="row" className="sticky-col name-col">
                      <span className="student-name-cell">{studentName}</span>
                    </th>
                    {chronologicalSessions.map((session) => {
                      const sessionId = str(session, "sesion_id");
                      const dateStr = str(session, "fecha_clase");
                      const status = attendanceMap.get(`${studentId}:${sessionId}`) || "";
                      const statusClass = status ? `status-${status.toLowerCase()}` : "status-empty";
                      const label = status === "P" ? "Asistencia" : status === "I" ? "Inasistencia" : status === "R" ? "Retardo" : "Sin registro";

                      return (
                        <td
                          key={sessionId}
                          className={`attendance-matrix-cell ${statusClass}`}
                          title={`${studentName}: ${label} (${dateStr})`}
                        >
                          {status || ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
