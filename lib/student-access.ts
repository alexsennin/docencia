import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { ExamDefinition, ExamQuestion, PublicExam, Student } from "./exam-types.ts";
import { toPublicExam } from "./exam-engine.ts";
import { getDatabase } from "../db/client.ts";
import { examAssignments, examAttempts, examQuestions, exams, students } from "../db/schema.ts";

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toExamQuestion(row: typeof examQuestions.$inferSelect): ExamQuestion {
  const rawOptions = parseJson(row.options);
  const optionRows = Array.isArray(rawOptions) ? rawOptions : [];
  const options = optionRows.map((item, index) => {
    const label = item && typeof item === "object"
      ? String((item as { label?: unknown; value?: unknown }).label ?? (item as { value?: unknown }).value ?? "")
      : String(item ?? "");
    return { value: String.fromCharCode(65 + index), label };
  });
  const rawType = row.type;
  const type: ExamQuestion["type"] = rawType === "clasificacion" || rawType === "abierta" ? rawType : "opcion_multiple";
  const answer = parseJson(row.correctAnswer);
  const rubric = parseJson(row.rubric);

  return {
    id: row.id,
    order: numberOr(row.order, 0),
    topic: row.topic ?? "",
    type,
    prompt: row.prompt ?? "",
    options,
    correctAnswer: typeof answer === "string" || Array.isArray(answer) ? answer as string | string[] : undefined,
    maxScore: numberOr(row.maxScore, 0),
    evaluationMethod: row.evaluationMethod === "ai" ? "ai" : "automatic",
    rubric: rubric && typeof rubric === "object" ? rubric as ExamQuestion["rubric"] : undefined,
  };
}

export function toExamDefinition(row: typeof exams.$inferSelect, questions: ExamQuestion[]): ExamDefinition {
  return {
    id: row.id,
    partialId: row.partialId,
    name: row.name,
    subject: row.subject ?? "",
    grade: row.grade ?? "",
    group: row.group ?? "",
    status: row.status === "Borrador" || row.status === "Cerrado" ? row.status : "Publicado",
    durationMinutes: numberOr(row.durationMinutes, 50),
    maxScore: numberOr(row.maxScore, 100),
    requiresFullscreen: row.requiresFullscreen ?? false,
    instructions: row.instructions ?? "",
    questions,
  };
}

export async function lookupStudentInPostgres(studentId: string): Promise<{ student: Student; exams: PublicExam[] }> {
  const normalizedId = studentId.trim().toUpperCase();
  if (!normalizedId) throw new Error("No se encontró el ID escolar");

  const db = getDatabase();
  const [studentRow] = await db
    .select()
    .from(students)
    .where(sql`upper(trim(${students.id})) = ${normalizedId}`)
    .limit(1);
  if (!studentRow) throw new Error("No se encontró el ID escolar");

  const student: Student = {
    id: studentRow.id,
    name: studentRow.name,
    grade: studentRow.grade ?? "",
    group: studentRow.group ?? "",
  };

  const assignments = await db
    .select({ examId: examAssignments.examId })
    .from(examAssignments)
    .where(and(
      sql`upper(trim(${examAssignments.studentId})) = ${student.id.trim().toUpperCase()}`,
      sql`upper(trim(coalesce(${examAssignments.status}, ''))) = 'ACTIVO'`,
    ));
  const assignedExamIds = assignments.map((row) => row.examId);
  const eligibleExamConditions = [];

  if (assignedExamIds.length > 0) {
    eligibleExamConditions.push(and(eq(exams.status, "Publicado"), inArray(exams.id, assignedExamIds)));
  }
  if (student.grade) {
    eligibleExamConditions.push(and(
      eq(exams.status, "Publicado"),
      eq(exams.grade, student.grade),
      or(eq(exams.group, "TODOS"), eq(exams.group, student.group)),
    ));
  }

  const examRows = eligibleExamConditions.length
    ? await db.select().from(exams).where(or(...eligibleExamConditions)).orderBy(asc(exams.createdAt), asc(exams.id))
    : [];
  if (examRows.length === 0) return { student, exams: [] };

  const examIds = examRows.map((row) => row.id);
  const questionRows = await db
    .select()
    .from(examQuestions)
    .where(and(inArray(examQuestions.examId, examIds), or(isNull(examQuestions.active), eq(examQuestions.active, true))))
    .orderBy(asc(examQuestions.order), asc(examQuestions.id));
  const attemptRows = await db
    .select()
    .from(examAttempts)
    .where(sql`upper(trim(${examAttempts.studentId})) = ${student.id.trim().toUpperCase()}`)
    .orderBy(asc(examAttempts.createdAt), asc(examAttempts.id));
  const questionsByExam = new Map<string, ExamQuestion[]>();
  for (const questionRow of questionRows) {
    const questions = questionsByExam.get(questionRow.examId) ?? [];
    questions.push(toExamQuestion(questionRow));
    questionsByExam.set(questionRow.examId, questions);
  }

  const publicExams = examRows.map((examRow) => {
    const definition = toExamDefinition(examRow, questionsByExam.get(examRow.id) ?? []);
    const relatedAttempts = attemptRows.filter((attempt) => attempt.examId === examRow.id);
    const attempt = relatedAttempts.find((item) => item.status !== "Activo" && item.status !== "Bloqueado") ?? relatedAttempts[0];
    return { ...toPublicExam(definition), attemptStatus: attempt?.status ?? "Disponible" };
  });

  return { student, exams: publicExams };
}
