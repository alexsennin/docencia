import type { AcademicRow, AcademicSnapshot } from "./academic-engine.ts";

export type ArchivedAcademicItem = {
  id: string;
  type: string;
  name: string;
  group: string;
  partialName: string;
  activityDate: string;
  archivedAt: string;
};

const text = (row: AcademicRow, key: string) => String(row[key] ?? "").trim();

export function listArchivedAcademicItems(snapshot: Pick<AcademicSnapshot, "partials" | "sessions" | "tasks">): ArchivedAcademicItem[] {
  const partialNames = new Map(snapshot.partials.map((item) => [text(item, "parcial_id"), text(item, "nombre")]));
  const archivedSessions = snapshot.sessions.filter((item) => text(item, "estado") === "Cancelada").map((item) => ({
    id: `session:${text(item, "sesion_id")}`,
    type: "Sesión",
    name: text(item, "tema") || "Sesión de clase",
    group: text(item, "grupo"),
    partialName: partialNames.get(text(item, "parcial_id")) || text(item, "parcial_id"),
    activityDate: text(item, "fecha_clase"),
    archivedAt: text(item, "updated_at"),
  }));
  const archivedTasks = snapshot.tasks.filter((item) => text(item, "activa").toUpperCase() === "FALSE").map((item) => ({
    id: `task:${text(item, "tarea_id")}`,
    type: text(item, "tipo") || "Actividad",
    name: text(item, "nombre") || "Actividad sin nombre",
    group: text(item, "grupo"),
    partialName: partialNames.get(text(item, "parcial_id")) || text(item, "parcial_id"),
    activityDate: text(item, "fecha_asignacion"),
    archivedAt: text(item, "updated_at"),
  }));
  return [...archivedSessions, ...archivedTasks].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt) || b.activityDate.localeCompare(a.activityDate));
}
