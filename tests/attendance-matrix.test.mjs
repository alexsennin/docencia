import assert from "node:assert/strict";
import test from "node:test";

function formatSessionDate(dateStr) {
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

function buildAttendanceTsv(students, sessions, absences) {
  const chronologicalSessions = [...sessions]
    .filter((s) => s.fecha_clase && s.estado !== "Cancelada")
    .sort((a, b) => String(a.fecha_clase).localeCompare(String(b.fecha_clase)));

  const sortedStudents = [...students].sort((a, b) =>
    String(a.nombre).localeCompare(String(b.nombre), "es-MX")
  );

  const attendanceMap = new Map();
  for (const record of absences) {
    const sId = String(record.sesion_id ?? "");
    const aId = String(record.alumno_id ?? "");
    const rawStatus = String(record.estado ?? "").trim().toUpperCase();
    if (sId && aId) {
      if (["P", "ASISTIO", "ASISTIÓ", "ASISTENCIA", "PRESENTE"].includes(rawStatus)) {
        attendanceMap.set(`${aId}:${sId}`, "P");
      } else if (["I", "NO_ASISTIO", "INASISTENCIA", "FALTA", "FALTÓ", "FALTO"].includes(rawStatus)) {
        attendanceMap.set(`${aId}:${sId}`, "I");
      } else if (["R", "RETARDO", "RETARDÓ", "RETARDADO"].includes(rawStatus)) {
        attendanceMap.set(`${aId}:${sId}`, "R");
      }
    }
  }

  const header = [
    "Nombre alumno",
    ...chronologicalSessions.map((session) => {
      const { short } = formatSessionDate(String(session.fecha_clase));
      return short || String(session.fecha_clase);
    }),
  ].join("\t");

  const rows = sortedStudents.map((student) => {
    const studentId = String(student.id);
    const studentName = String(student.nombre);
    const statuses = chronologicalSessions.map((session) => {
      const sessionId = String(session.sesion_id);
      return attendanceMap.get(`${studentId}:${sessionId}`) || "";
    });
    return [studentName, ...statuses].join("\t");
  });

  return [header, ...rows].join("\n");
}

test("formatSessionDate formatea DD/MM y día de semana en español", () => {
  // 2026-09-14 fue Lunes
  const res = formatSessionDate("2026-09-14");
  assert.equal(res.short, "14/09");
  assert.equal(res.dayOfWeek, "LUN");
});

test("ordena alumnos alfabéticamente por apellido y sesiones cronológicamente", () => {
  const students = [
    { id: "S2", nombre: "HEREDIA ELVIRA ESTEBAN" },
    { id: "S1", nombre: "AGUIRRE TELLO MARIA" },
    { id: "S3", nombre: "ÁLVAREZ MARTÍNEZ LESLY" },
  ];

  const sessions = [
    { sesion_id: "ses-2", fecha_clase: "2026-09-15", estado: "Impartida" },
    { sesion_id: "ses-1", fecha_clase: "2026-09-14", estado: "Impartida" },
    { sesion_id: "ses-3", fecha_clase: "2026-09-16", estado: "Cancelada" },
  ];

  const absences = [
    { sesion_id: "ses-1", alumno_id: "S1", estado: "P" },
    { sesion_id: "ses-2", alumno_id: "S1", estado: "I" },
    { sesion_id: "ses-1", alumno_id: "S2", estado: "R" },
  ];

  const tsv = buildAttendanceTsv(students, sessions, absences);
  const lines = tsv.split("\n");

  assert.equal(lines[0], "Nombre alumno\t14/09\t15/09");
  assert.equal(lines[1], "AGUIRRE TELLO MARIA\tP\tI");
  assert.equal(lines[2], "ÁLVAREZ MARTÍNEZ LESLY\t\t");
  assert.equal(lines[3], "HEREDIA ELVIRA ESTEBAN\tR\t");
});
