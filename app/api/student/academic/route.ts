import { calculateStudentPartial, type AcademicRow, type AcademicSnapshot } from "../../../../lib/academic-engine";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { getDataBackend } from "../../../../lib/data-backend";
import { getStudentAcademicInPostgres } from "../../../../lib/student-academic";

export const dynamic = "force-dynamic";

type StudentAcademicData = Pick<AcademicSnapshot, "partials" | "sessions" | "absences" | "tasks" | "taskScores" | "conduct" | "grades" | "exams" | "attempts" | "assignments">
  & { student: Record<string, string>; reports: AcademicRow[] };

export async function GET(request: Request) {
  const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
  if (!studentId) return Response.json({ error: "Falta el ID escolar." }, { status: 400 });
  try {
    let data: StudentAcademicData;
    if (getDataBackend() === "postgres") {
      data = await getStudentAcademicInPostgres(studentId) as unknown as StudentAcademicData;
    } else {
      if (!hasSheetsBridge()) return Response.json({ error: "No está configurada la conexión con Google Sheets." }, { status: 503 });
      data = await sheetsBridge<StudentAcademicData>("getStudentAcademic", { studentId });
    }
    const matrix = data.partials.map((partial) => ({ ...calculateStudentPartial(data as unknown as AcademicSnapshot, {
      id: data.student.id, nombre: data.student.name, grado: data.student.grade, grupo: data.student.group,
    }, partial), partialName: String(partial.nombre ?? partial.parcial_id) }));
    const reports = data.reports.map((report) => {
      const parse = (input: unknown) => { try { return JSON.parse(String(input || "[]")); } catch { return []; } };
      return { partialId: String(report.parcial_id ?? ""), summary: String(report.resumen ?? ""), strengths: parse(report.fortalezas), opportunities: parse(report.areas_oportunidad), recommendations: parse(report.recomendaciones_json) };
    });
    return Response.json({ student: data.student, matrix, tasks: data.tasks, taskScores: data.taskScores, conduct: data.conduct, reports, source: getDataBackend() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar el avance." }, { status: 502 });
  }
}
