import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import {
  applyStudentImportInPostgres,
  createStudentGradeInPostgres,
  createStudentGroupInPostgres,
  getStudentRegistryInPostgres,
  previewStudentImportInPostgres,
  saveStudentInPostgres,
  setStudentActiveInPostgres,
  setStudentGradeActiveInPostgres,
  setStudentGroupActiveInPostgres,
  updateStudentGradeInPostgres,
  updateStudentGroupInPostgres,
  StudentRegistryError,
} from "../../../../lib/student-registry-postgres";
import { parseStudentRosterUpload } from "../../../../lib/student-roster-file";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function backendError() {
  return Response.json({ error: "La gestión del padrón requiere el backend PostgreSQL activo." }, { status: 503, headers: noStore });
}

export async function GET() {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401, headers: noStore });
  if (getDataBackend() !== "postgres") return backendError();
  try {
    return Response.json(await getStudentRegistryInPostgres(), { headers: noStore });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar el padrón." }, { status: 502, headers: noStore });
  }
}

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401, headers: noStore });
  if (getDataBackend() !== "postgres") return backendError();
  try {
    const multipart = request.headers.get("content-type")?.includes("multipart/form-data") ?? false;
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > (multipart ? 5 * 1024 * 1024 + 256 * 1024 : 2 * 1024 * 1024)) {
      return Response.json({ error: "El archivo o lote excede el tamaño permitido." }, { status: 413, headers: noStore });
    }
    if (multipart) {
      const form = await request.formData();
      if (form.get("action") !== "previewImport") return Response.json({ error: "Acción del archivo no permitida." }, { status: 400, headers: noStore });
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "Selecciona un archivo .xlsx." }, { status: 400, headers: noStore });
      const rows = await parseStudentRosterUpload(file);
      const preview = await previewStudentImportInPostgres(rows, form.get("schoolYear"));
      return Response.json({ ...preview, rows }, { headers: noStore });
    }

    const body = await request.json() as { action?: string; payload?: Record<string, unknown> };
    const payload = body.payload ?? {};
    let result: unknown;
    switch (body.action) {
      case "createGrade": result = await createStudentGradeInPostgres(payload); break;
      case "updateGrade": result = await updateStudentGradeInPostgres(payload); break;
      case "setGradeActive": result = await setStudentGradeActiveInPostgres(payload); break;
      case "createGroup": result = await createStudentGroupInPostgres(payload); break;
      case "updateGroup": result = await updateStudentGroupInPostgres(payload); break;
      case "setGroupActive": result = await setStudentGroupActiveInPostgres(payload); break;
      case "saveStudent": result = await saveStudentInPostgres(payload); break;
      case "setStudentActive": result = await setStudentActiveInPostgres(payload); break;
      case "applyImport": result = await applyStudentImportInPostgres(payload); break;
      default: return Response.json({ error: "Acción de gestión no permitida." }, { status: 400, headers: noStore });
    }
    return Response.json({ result }, { headers: noStore });
  } catch (error) {
    const status = error instanceof StudentRegistryError ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el cambio." }, { status, headers: noStore });
  }
}
