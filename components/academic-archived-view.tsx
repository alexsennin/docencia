"use client";

import type { ReactNode } from "react";

type ArchivedItem = {
  id: string;
  type: string;
  name: string;
  group: string;
  partialName: string;
  activityDate: string;
  archivedAt: string;
};

type AcademicArchivedViewProps = {
  archivedItems: ArchivedItem[];
};

export function AcademicArchivedView({ archivedItems }: AcademicArchivedViewProps): ReactNode {
  return (
    <section className="academic-card archived-records-card" aria-labelledby="archived-records-title">
      <div className="academic-matrix-header">
        <div>
          <p className="eyebrow">CONSULTA GENERAL</p>
          <h3 id="archived-records-title">Registros archivados</h3>
          <p>Las sesiones, tareas y trabajos archivados se conservan aquí y ya no participan en los cálculos activos.</p>
        </div>
        <span className="result-count">
          {archivedItems.length} {archivedItems.length === 1 ? "registro" : "registros"}
        </span>
      </div>
      {archivedItems.length ? (
        <div className="matrix-scroll">
          <table className="academic-matrix archived-records-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Nombre</th>
                <th>Grupo</th>
                <th>Parcial</th>
                <th>Fecha de actividad</th>
                <th>Archivado</th>
              </tr>
            </thead>
            <tbody>
              {archivedItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.type}</td>
                  <th>{item.name}</th>
                  <td>{item.group || "—"}</td>
                  <td>{item.partialName || "—"}</td>
                  <td>{item.activityDate || "—"}</td>
                  <td>{item.archivedAt ? new Date(item.archivedAt).toLocaleDateString("es-MX") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">Todavía no hay sesiones, tareas ni trabajos archivados.</p>
      )}
    </section>
  );
}
