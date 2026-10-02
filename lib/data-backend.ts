export type DataBackend = "sheets" | "postgres";

export function getDataBackend(): DataBackend {
  const backend = process.env.DATA_BACKEND || "sheets";
  if (backend !== "sheets" && backend !== "postgres") {
    throw new Error("DATA_BACKEND debe ser 'sheets' o 'postgres'.");
  }
  if (
    backend === "postgres" &&
    process.env.VERCEL_ENV === "production" &&
    process.env.POSTGRES_PRODUCTION_CUTOVER_APPROVED !== "YES"
  ) {
    throw new Error(
      "El backend PostgreSQL en Producción está bloqueado. Cierra y aprueba las puertas de migración antes de establecer POSTGRES_PRODUCTION_CUTOVER_APPROVED=YES.",
    );
  }
  return backend;
}
