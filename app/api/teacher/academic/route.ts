import { calculateAcademicMatrix, toGradeSnapshotRow, type AcademicSnapshot } from "../../../../lib/academic-engine";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import { approveCaRubricPostgres } from "../../../../lib/ca-rubric-postgres";
import { AcademicReportError, approveAcademicReportInPostgres, generateAcademicReportInPostgres } from "../../../../lib/academic-report-postgres";
import { AcademicPeriodError, attachTasksToSessionInPostgres, cancelClassSessionInPostgres, createAcademicPeriodInPostgres, createTaskInPostgres, deleteTaskInPostgres, getTeacherAcademicSnapshotInPostgres, saveClassSessionInPostgres, saveGradeSnapshotsInPostgres, savePartialModeInPostgres, saveSessionWorkspaceInPostgres, saveTaskWeightsInPostgres } from "../../../../lib/teacher-session-postgres";

export const dynamic = "force-dynamic";

async function loadAcademicData(persistPartialId?: string, backend = getDataBackend()) {
  const snapshot = backend === "postgres"
    ? await getTeacherAcademicSnapshotInPostgres()
    : await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
  const rows = calculateAcademicMatrix(snapshot).map(toGradeSnapshotRow);
  if (persistPartialId && backend === "postgres") {
    const partialRows = rows.filter((row) => row.partialId === persistPartialId);
    for (let index = 0; index < partialRows.length; index += 250) {
      await saveGradeSnapshotsInPostgres(partialRows.slice(index, index + 250));
    }
  } else if (persistPartialId && backend === "sheets") {
    const partialRows = rows.filter((row) => row.partialId === persistPartialId);
    for (let index = 0; index < partialRows.length; index += 250) {
      await sheetsBridge("saveGradeSnapshot", { rows: partialRows.slice(index, index + 250) });
    }
  }
  return { snapshot, matrix: rows };
}

export async function GET() {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const backend = getDataBackend();
    if (backend === "sheets" && !hasSheetsBridge()) return Response.json({ error: "No está configurada la conexión con Google Sheets." }, { status: 503 });
    const data = await loadAcademicData(undefined, backend);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar la matriz." }, { status: 502 });
  }
}

const actions = new Set([
  "createPartial", "savePartialMode", "saveTaskWeights", "saveClassSession", "saveAbsences", "cancelClassSession", "deleteTask",
  "createTask", "attachTasksToSession", "saveTaskScores", "saveConductObservation", "saveCaScores", "saveSessionWorkspace",
  "generateCaRubric", "approveCaRubric",
  "generateAiReport", "publishAiReport",
]);

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  let completedAction = "";
  let completedResult: unknown = null;
  try {
    const body = await request.json() as { action?: string; payload?: Record<string, unknown> };
    if (!body.action || !actions.has(body.action)) return Response.json({ error: "Acción académica no permitida." }, { status: 400 });
    const backend = getDataBackend();
    if (backend === "sheets" && !hasSheetsBridge()) return Response.json({ error: "No está configurada la conexión con Google Sheets." }, { status: 503 });
    if (backend === "postgres") {
      const payload = body.payload ?? {};
      const result = body.action === "saveClassSession"
        ? await saveClassSessionInPostgres(payload)
        : body.action === "createPartial"
          ? await createAcademicPeriodInPostgres(payload)
        : body.action === "savePartialMode"
          ? await savePartialModeInPostgres(payload)
        : body.action === "saveTaskWeights"
          ? await saveTaskWeightsInPostgres(payload)
        : body.action === "createTask"
          ? await createTaskInPostgres(payload)
        : body.action === "cancelClassSession"
          ? await cancelClassSessionInPostgres(payload)
        : body.action === "deleteTask"
          ? await deleteTaskInPostgres(payload)
          : body.action === "attachTasksToSession"
          ? await attachTasksToSessionInPostgres(payload)
        : body.action === "approveCaRubric"
          ? await approveCaRubricPostgres(payload as { partialId?: string; studentId?: string; scores?: unknown[] })
        : body.action === "generateAiReport"
          ? await generateAcademicReportInPostgres(payload as { studentId?: string; partialId?: string })
        : body.action === "publishAiReport"
          ? await approveAcademicReportInPostgres(payload as { reportId?: string })
        : body.action === "saveSessionWorkspace"
          ? await saveSessionWorkspaceInPostgres(payload)
          : null;
      if (result === null) return Response.json({ error: `La acción ${body.action} todavía no está migrada a PostgreSQL.` }, { status: 501 });
      let partialId = String(payload.partialId || (result && typeof result === "object" ? (result as Record<string, unknown>).parcial_id ?? (result as Record<string, unknown>).partialId ?? "" : ""));
      const academic = await loadAcademicData(undefined, backend);
      if (!partialId && typeof payload.sessionId === "string") {
        partialId = String(academic.snapshot.sessions.find((session) => String(session.sesion_id ?? "") === payload.sessionId)?.parcial_id ?? "");
      }
      if (!partialId && typeof payload.taskId === "string") {
        partialId = String(academic.snapshot.tasks.find((task) => String(task.tarea_id ?? "") === payload.taskId)?.parcial_id ?? "");
      }
      if (!partialId && Array.isArray(payload.taskIds)) {
        const selected = new Set(payload.taskIds.map(String));
        partialId = String(academic.snapshot.tasks.find((task) => selected.has(String(task.tarea_id ?? "")))?.parcial_id ?? "");
      }
      if (partialId) {
        const partialRows = academic.matrix.filter((row) => row.partialId === partialId);
        for (let index = 0; index < partialRows.length; index += 250) await saveGradeSnapshotsInPostgres(partialRows.slice(index, index + 250));
      }
      return Response.json({ result, ...academic }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "createTask") {
      const result = await sheetsBridge("createTask", body.payload ?? {});
      return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
    }
    let payload = body.payload ?? {};
    let action = body.action;
    if (action === "generateAiReport") {
      const snapshot = await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
      const student = snapshot.students.find((item) => String(item.id ?? "").trim().toUpperCase() === String(payload.studentId ?? "").trim().toUpperCase());
      const partial = snapshot.partials.find((item) => String(item.parcial_id ?? "") === String(payload.partialId ?? ""));
      if (!student || !partial) return Response.json({ error: "Alumno o parcial no válidos." }, { status: 400 });
      const grade = calculateAcademicMatrix({ ...snapshot, students: [student], partials: [partial] })[0];
      const observations = snapshot.conduct.filter((item) => String(item.parcial_id ?? "") === grade.partialId && String(item.alumno_id ?? "").trim().toUpperCase() === grade.studentId.toUpperCase()).map((item) => ({ tipo: item.tipo, observacion: item.observacion, infraccion: item.infraccion }));
      payload = { studentId: grade.studentId, partialId: grade.partialId, context: { days: grade.days, absences: grade.absences, missingTasks: grade.missingTasks, ca: grade.ca, ec: grade.ec, ex: grade.ex, final10: grade.final10, ecMode: grade.ecMode, ecDetails: grade.ecDetails, observations } };
      action = "generateAcademicReport";
    } else if (action === "publishAiReport") {
      action = "publishAcademicReport";
    }
    const result = await sheetsBridge(action, payload);
    completedAction = body.action;
    completedResult = result;
    const mutatesGrades = new Set(["createPartial", "savePartialMode", "saveTaskWeights", "saveClassSession", "saveAbsences", "cancelClassSession", "createTask", "deleteTask", "attachTasksToSession", "saveTaskScores", "saveConductObservation", "saveCaScores", "saveSessionWorkspace", "approveCaRubric"]);
    let partialId = String(payload.partialId || (result && typeof result === "object" ? (result as Record<string, unknown>).parcial_id ?? (result as Record<string, unknown>).partialId ?? "" : ""));
    if (!partialId && typeof payload.sessionId === "string") {
      const current = await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
      partialId = String(current.sessions.find((session) => String(session.sesion_id ?? "") === payload.sessionId)?.parcial_id ?? "");
    }
    if (!partialId && typeof payload.taskId === "string") {
      const current = await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
      partialId = String(current.tasks.find((task) => String(task.tarea_id ?? "") === payload.taskId)?.parcial_id ?? "");
    }
    const academic = await loadAcademicData(mutatesGrades.has(body.action) ? partialId : undefined);
    return Response.json({ result, ...academic }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Creating a classwork item can succeed before the optional grade-snapshot
    // refresh fails. Return the authoritative live snapshot so the client can
    // close the form and show the newly saved column without duplicating it.
    if (completedAction === "createTask" && completedResult && typeof completedResult === "object") {
      try {
        const snapshot = await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
        const matrix = calculateAcademicMatrix(snapshot).map(toGradeSnapshotRow);
        return Response.json({ result: completedResult, snapshot, matrix, warning: "El trabajo se guardó y la matriz se actualizó; la copia de promedios se actualizará después." }, { headers: { "Cache-Control": "no-store" } });
      } catch {
        // Preserve the normal error response when a current matrix cannot be read.
      }
    }
    const status = error instanceof AcademicReportError || error instanceof AcademicPeriodError ? error.status : 502;
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el cambio." }, { status });
  }
}
