import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "../db/client.ts";
import {
  aiEvaluations,
  auditEvents,
  examAnswers,
  examAssignments,
  examAttempts,
  examQuestions,
  exams,
  students,
} from "../db/schema.ts";
import { evaluateAutomatic, toPublicExam } from "./exam-engine.ts";
import { toExamDefinition, toExamQuestion } from "./student-access.ts";
import type { AnswerMap, ExamDefinition, ExamQuestion, ExamResult } from "./exam-types.ts";

const ACTIVE_STATES = ["Activo", "Bloqueado", "Evaluando"] as const;
const ACTIVE_QUESTION = sql`coalesce(${examQuestions.active}, true) = true`;
const MAX_ANSWER_LENGTH = 12_000;
const AI_PROCESSING_LEASE_MS = 5 * 60_000;

export class ExamWorkflowError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ExamWorkflowError";
    this.status = status;
  }
}

function sameId(left: unknown, right: unknown) {
  return String(left ?? "").trim().toUpperCase() === String(right ?? "").trim().toUpperCase();
}

function parseStoredAnswer(value: unknown): string | string[] {
  if (typeof value !== "string") return String(value ?? "");
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      // Keep legacy non-JSON text as a plain answer.
    }
  }
  return value;
}

function storedAnswers(rows: (typeof examAnswers.$inferSelect)[]): AnswerMap {
  return Object.fromEntries(rows.map((row) => [row.questionId, parseStoredAnswer(row.answer)]));
}

function validateAnswerMap(value: unknown, questions: ExamQuestion[], includeMissing = false): AnswerMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ExamWorkflowError("Las respuestas no tienen un formato válido.");
  const input = value as Record<string, unknown>;
  const allowed = new Set(questions.map((question) => question.id));
  for (const questionId of Object.keys(input)) {
    if (!allowed.has(questionId)) throw new ExamWorkflowError("Reactivo no autorizado.", 403);
  }
  const output: AnswerMap = {};
  for (const question of questions) {
    if (!(question.id in input) && !includeMissing) continue;
    const raw = input[question.id];
    if (raw === undefined || raw === null) {
      output[question.id] = "";
      continue;
    }
    if (Array.isArray(raw)) {
      if (raw.length > 50 || raw.some((item) => typeof item !== "string" || item.length > 500)) throw new ExamWorkflowError("Una respuesta excede el tamaño permitido.");
      output[question.id] = raw;
      continue;
    }
    if (typeof raw !== "string" || raw.length > MAX_ANSWER_LENGTH) throw new ExamWorkflowError("Una respuesta excede el tamaño permitido.");
    output[question.id] = raw;
  }
  return output;
}

function serializeAnswer(answer: string | string[]) {
  return Array.isArray(answer) ? JSON.stringify(answer) : answer;
}

async function loadExamDefinition(examId: string, publishedOnly: boolean): Promise<ExamDefinition | null> {
  const db = getDatabase();
  const [exam] = await db.select().from(exams).where(publishedOnly
    ? and(eq(exams.id, examId), eq(exams.status, "Publicado"))
    : eq(exams.id, examId)).limit(1);
  if (!exam) return null;
  const questionRows = await db.select().from(examQuestions)
    .where(and(eq(examQuestions.examId, examId), ACTIVE_QUESTION))
    .orderBy(asc(examQuestions.order), asc(examQuestions.id));
  return toExamDefinition(exam, questionRows.map(toExamQuestion));
}

function deadlineFor(attempt: typeof examAttempts.$inferSelect) {
  const startedAt = Date.parse(attempt.startedAt ?? "");
  const durationMinutes = Number(attempt.timeLimitMinutes ?? 0);
  if (!Number.isFinite(startedAt) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new ExamWorkflowError("No se pudo validar el límite de tiempo del intento.", 409);
  return new Date(startedAt + durationMinutes * 60_000);
}

function eligibleForExam(
  student: typeof students.$inferSelect,
  exam: typeof exams.$inferSelect,
  assignmentRows: (typeof examAssignments.$inferSelect)[],
) {
  const explicitlyAssigned = assignmentRows.some((item) => item.status?.trim().toLowerCase() === "activo");
  const sameGroup = String(student.grade ?? "") === String(exam.grade ?? "")
    && (String(exam.group ?? "").toUpperCase() === "TODOS" || String(student.group ?? "") === String(exam.group ?? ""));
  return explicitlyAssigned || sameGroup;
}

function resultFromRows(
  attempt: typeof examAttempts.$inferSelect,
  exam: ExamDefinition,
  answerRows: (typeof examAnswers.$inferSelect)[],
  evaluationRows: (typeof aiEvaluations.$inferSelect)[],
): ExamResult {
  const answers = storedAnswers(answerRows);
  const automatic = evaluateAutomatic(exam, answers, attempt.id, attempt.studentId);
  const answerByQuestion = new Map(answerRows.map((row) => [row.questionId, row]));
  const evaluationByQuestion = new Map(evaluationRows.map((row) => [row.questionId, row]));
  let aiPending = false;
  let aiScore = 0;
  const items = exam.questions.map((question) => {
    const saved = answerByQuestion.get(question.id);
    const answer = answers[question.id];
    const empty = answer === undefined || answer === "" || (Array.isArray(answer) && answer.every((item) => !item));
    if (question.evaluationMethod !== "ai") {
      const item = automatic.items.find((candidate) => candidate.questionId === question.id)!;
      return saved?.manualScore == null ? item : { ...item, score: Number(saved.manualScore) };
    }
    if (empty) return { questionId: question.id, order: question.order, maxScore: question.maxScore, score: 0, status: "sin_respuesta" as const, feedback: "No se registró una respuesta." };
    const evaluation = evaluationByQuestion.get(question.id);
    if (!evaluation || evaluation.status !== "Evaluada") {
      if (saved?.manualScore != null) {
        const score = Number(saved.manualScore);
        aiScore += Number.isFinite(score) ? score : 0;
        return { questionId: question.id, order: question.order, maxScore: question.maxScore, score, status: "correcta" as const, feedback: saved.feedback ?? "Calificación ajustada por la docente." };
      }
      aiPending = true;
      return { questionId: question.id, order: question.order, maxScore: question.maxScore, score: null, status: "pendiente_ia" as const, feedback: "Respuesta pendiente de evaluación con IA o revisión docente." };
    }
    const score = Number(saved?.manualScore ?? evaluation.score ?? saved?.score ?? 0);
    aiScore += Number.isFinite(score) ? score : 0;
    const detail = evaluation.breakdown && typeof evaluation.breakdown === "object"
      ? evaluation.breakdown as { feedback?: unknown; strengths?: unknown; opportunities?: unknown }
      : {};
    return {
      questionId: question.id,
      order: question.order,
      maxScore: question.maxScore,
      score,
      status: "correcta" as const,
      feedback: String(detail.feedback ?? evaluation.feedback ?? saved?.feedback ?? "Evaluación generada por IA."),
      strengths: Array.isArray(detail.strengths) ? detail.strengths.map(String) : [],
      opportunities: Array.isArray(detail.opportunities) ? detail.opportunities.map(String) : [],
    };
  });
  const automaticScore = items.filter((item) => exam.questions.find((question) => question.id === item.questionId)?.evaluationMethod !== "ai")
    .reduce((sum, item) => sum + (item.score ?? 0), 0);
  const totalScore = aiPending ? null : automaticScore + aiScore;
  return {
    attemptId: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    automaticScore,
    aiScore,
    totalScore,
    grade10: attempt.manualGradeLocked && attempt.manualGradeOnTen !== null
      ? Number(attempt.manualGradeOnTen)
      : totalScore === null ? null : Number(((totalScore / exam.maxScore) * 10).toFixed(2)),
    maxScore: exam.maxScore,
    aiPending,
    items,
    submittedAt: attempt.finishedAt ?? attempt.updatedAt ?? attempt.startedAt ?? new Date().toISOString(),
  };
}

async function insertAuditEvent(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  type: string,
  attempt: typeof examAttempts.$inferSelect,
  details: Record<string, unknown>,
  occurredAt: string,
) {
  await tx.insert(auditEvents).values({
    id: `event-${randomUUID()}`,
    type,
    entity: "INTENTOS",
    entityId: attempt.id,
    partialId: attempt.partialId,
    studentId: attempt.studentId,
    actorId: attempt.studentId,
    details,
    occurredAt,
  });
}

export async function startExamAttemptInPostgres(input: { studentId?: string; examId?: string }, now = new Date()) {
  const studentId = String(input.studentId ?? "").trim();
  const examId = String(input.examId ?? "").trim();
  if (!studentId || !examId) throw new ExamWorkflowError("Faltan datos para iniciar el examen.");
  const examDefinition = await loadExamDefinition(examId, true);
  if (!examDefinition) throw new ExamWorkflowError("Examen no encontrado o no publicado.", 404);
  if (!examDefinition.questions.length) throw new ExamWorkflowError("El examen publicado no contiene reactivos activos.", 409);

  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`exam-attempt:${examId}:${studentId.toUpperCase()}`}))`);
    const [student] = await tx.select().from(students).where(sql`upper(trim(${students.id})) = ${studentId.toUpperCase()}`).limit(1);
    const [exam] = await tx.select().from(exams).where(eq(exams.id, examId)).for("update").limit(1);
    if (!student || !exam || exam.status !== "Publicado") throw new ExamWorkflowError("El examen no está disponible para este alumno.", 403);
    const assignmentRows = await tx.select().from(examAssignments).where(and(
      eq(examAssignments.examId, examId),
      sql`upper(trim(${examAssignments.studentId})) = ${student.id.toUpperCase()}`,
      sql`lower(trim(coalesce(${examAssignments.status}, ''))) = 'activo'`,
    ));
    if (!eligibleForExam(student, exam, assignmentRows)) throw new ExamWorkflowError("El examen no está asignado a este alumno.", 403);

    const related = await tx.select().from(examAttempts).where(and(
      eq(examAttempts.examId, examId),
      sql`upper(trim(${examAttempts.studentId})) = ${student.id.toUpperCase()}`,
    )).orderBy(asc(examAttempts.createdAt), asc(examAttempts.id));
    const existing = related.find((row) => ACTIVE_STATES.includes(row.status as typeof ACTIVE_STATES[number])) ?? related.at(-1);
    if (existing && ACTIVE_STATES.includes(existing.status as typeof ACTIVE_STATES[number])) {
      const answersRows = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, existing.id));
      const startDate = new Date(existing.startedAt ?? now.toISOString());
      let current = existing;
      let submissionPending = existing.status === "Evaluando";
      if (existing.status === "Activo" && now.getTime() > deadlineFor(existing).getTime() + 60_000) {
        const expiredAt = now.toISOString();
        const [updated] = await tx.update(examAttempts).set({ status: "Evaluando", finishedAt: expiredAt, locked: false, lockedAt: null, updatedAt: expiredAt }).where(eq(examAttempts.id, existing.id)).returning();
        current = updated ?? existing;
        submissionPending = true;
      }
      return {
        attemptId: current.id,
        startedAt: startDate.toISOString(),
        deadlineAt: deadlineFor(current).toISOString(),
        exam: toPublicExam(examDefinition),
        answers: storedAnswers(answersRows),
        locked: current.status === "Bloqueado",
        resumed: true,
        submissionPending,
      };
    }
    if (existing) {
      const answerRows = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, existing.id));
      const evaluationRows = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, existing.id));
      return { attemptId: existing.id, exam: toPublicExam(examDefinition), completed: true, result: resultFromRows(existing, examDefinition, answerRows, evaluationRows) };
    }

    const startedAt = now.toISOString();
    const attemptId = `attempt-${randomUUID()}`;
    const durationMinutes = Number(exam.durationMinutes ?? examDefinition.durationMinutes ?? 50);
    const [created] = await tx.insert(examAttempts).values({
      id: attemptId,
      examId,
      partialId: exam.partialId,
      studentId: student.id,
      group: student.group ?? "",
      status: "Activo",
      startedAt,
      finishedAt: null,
      timeLimitMinutes: String(durationMinutes),
      automaticScore: null,
      aiScore: null,
      totalScore: null,
      gradeOnTen: null,
      aiPending: false,
      locked: false,
      lockedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    }).returning();
    await insertAuditEvent(tx, "exam_started", created!, { examId }, startedAt);
    return {
      attemptId,
      startedAt,
      deadlineAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
      exam: toPublicExam(examDefinition),
    };
  });
}

export async function saveExamAnswersInPostgres(input: { attemptId?: string; examId?: string; studentId?: string; answers?: unknown }, now = new Date()) {
  const attemptId = String(input.attemptId ?? "").trim();
  const examId = String(input.examId ?? "").trim();
  const studentId = String(input.studentId ?? "").trim();
  if (!attemptId || !examId || !studentId) throw new ExamWorkflowError("Intento incompleto.");
  const exam = await loadExamDefinition(examId, false);
  if (!exam) throw new ExamWorkflowError("Examen no encontrado.", 404);
  const answers = validateAnswerMap(input.answers, exam.questions);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt || !sameId(attempt.studentId, studentId) || attempt.examId !== examId) throw new ExamWorkflowError("Intento no autorizado.", 403);
    if (attempt.status !== "Activo" || attempt.locked) throw new ExamWorkflowError(attempt.status === "Bloqueado" ? "El examen está bloqueado. Solicita al docente que lo desbloquee." : "El examen ya fue enviado.", 409);
    if (now.getTime() > deadlineFor(attempt).getTime() + 60_000) throw new ExamWorkflowError("El tiempo del examen terminó; no se aceptan más cambios.", 409);
    const savedAt = now.toISOString();
    const questionById = new Map(exam.questions.map((question) => [question.id, question]));
    for (const [questionId, answer] of Object.entries(answers)) {
      const serialized = serializeAnswer(answer);
      const [saved] = await tx.insert(examAnswers).values({
        id: `answer-${randomUUID()}`,
        attemptId,
        questionId,
        studentId: attempt.studentId,
        answer: serialized,
        status: serialized ? "Guardada" : "Sin_respuesta",
        score: null,
        evaluationMethod: null,
        feedback: null,
        aiStatus: null,
        updatedAt: savedAt,
      }).onConflictDoUpdate({
        target: [examAnswers.attemptId, examAnswers.questionId],
        set: { answer: serialized, status: serialized ? "Guardada" : "Sin_respuesta", score: null, evaluationMethod: null, feedback: null, aiStatus: null, updatedAt: savedAt },
      }).returning();
      if (!saved || !questionById.has(questionId)) throw new ExamWorkflowError("No se pudo guardar un reactivo del intento.", 409);
    }
    return { savedAt };
  });
}

export async function recordExamEventInPostgres(input: { attemptId?: string; examId?: string; studentId?: string; event?: string }, now = new Date()) {
  const attemptId = String(input.attemptId ?? "").trim();
  const examId = String(input.examId ?? "").trim();
  const studentId = String(input.studentId ?? "").trim();
  const event = String(input.event ?? "");
  if (!attemptId || !examId || !studentId || !["window_blur", "visibility_hidden", "fullscreen_exit"].includes(event)) throw new ExamWorkflowError("El evento del intento no es válido.");
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt || !sameId(attempt.studentId, studentId) || attempt.examId !== examId) throw new ExamWorkflowError("Intento no autorizado.", 403);
    if (!["Activo", "Bloqueado"].includes(String(attempt.status ?? ""))) throw new ExamWorkflowError("El intento ya terminó.", 409);
    const occurredAt = now.toISOString();
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`,
      type: event,
      entity: "INTENTOS",
      entityId: attemptId,
      partialId: attempt.partialId,
      studentId: attempt.studentId,
      actorId: attempt.studentId,
      details: { event },
      occurredAt,
    });
    if (event === "window_blur" || event === "visibility_hidden" || event === "fullscreen_exit") {
      await tx.update(examAttempts).set({ status: "Bloqueado", locked: true, lockedAt: occurredAt, updatedAt: occurredAt }).where(eq(examAttempts.id, attemptId));
    }
    return { recorded: true };
  });
}

export async function unlockExamAttemptInPostgres(input: { attemptId?: string; password?: string }, now = new Date()) {
  const attemptId = String(input.attemptId ?? "").trim();
  const password = String(input.password ?? "");
  if (!attemptId || !password) throw new ExamWorkflowError("Captura la contraseña de desbloqueo.");
  const expected = process.env.EXAM_UNLOCK_PASSWORD ?? "";
  const suppliedBytes = Buffer.from(password);
  const expectedBytes = Buffer.from(expected);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) throw new ExamWorkflowError("Contraseña incorrecta.", expected ? 401 : 503);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(and(eq(examAttempts.id, attemptId), eq(examAttempts.status, "Bloqueado"))).for("update").limit(1);
    if (!attempt) throw new ExamWorkflowError("No hay un intento bloqueado para desbloquear.", 404);
    const blockedAtMs = Date.parse(attempt.lockedAt ?? attempt.updatedAt ?? now.toISOString());
    const pauseMinutes = Number.isFinite(blockedAtMs) ? Math.max(0, (now.getTime() - blockedAtMs) / 60_000) : 0;
    const durationMinutes = Number(attempt.timeLimitMinutes ?? 50) + pauseMinutes;
    const unlockedAt = now.toISOString();
    const [updated] = await tx.update(examAttempts).set({
      status: "Activo", locked: false, lockedAt: null, timeLimitMinutes: String(durationMinutes), updatedAt: unlockedAt,
    }).where(eq(examAttempts.id, attemptId)).returning();
    await insertAuditEvent(tx, "exam_unlocked", updated!, { pausedMinutes: pauseMinutes }, unlockedAt);
    return { ok: true, unlockedAt, deadlineAt: deadlineFor(updated!).toISOString() };
  });
}

type GeminiEvaluation = { score: number; level: string; feedback: string; strengths: string[]; opportunities: string[] };
type EvaluateOpenAnswer = (exam: ExamDefinition, question: ExamQuestion, answer: string | string[]) => Promise<GeminiEvaluation>;

export async function evaluateOpenAnswerWithGeminiInPostgres(exam: ExamDefinition, question: ExamQuestion, answer: string | string[]): Promise<GeminiEvaluation> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  if (!apiKey) throw new ExamWorkflowError("La clave de Gemini aún no está configurada en el servidor.", 503);
  const prompt = `Evalúa la respuesta de un alumno de Español usando exclusivamente la consigna y rúbrica. Devuelve JSON con score, level, feedback, strengths y opportunities. score debe ser numérico entre 0 y ${question.maxScore}.\nExamen: ${exam.name}\nConsigna: ${question.prompt}\nRespuesta: ${JSON.stringify(answer || "")}\nRúbrica: ${JSON.stringify(question.rubric || {})}`;
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(35_000),
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
    });
  } catch {
    throw new Error("No se pudo conectar con Gemini.");
  }
  if (!response.ok) throw new Error(`La evaluación Gemini falló (HTTP ${response.status}).`);
  const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini no devolvió una evaluación.");
  let data: unknown;
  try { data = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, "")); }
  catch { throw new Error("Gemini devolvió una evaluación inválida."); }
  if (!data || typeof data !== "object") throw new Error("Gemini devolvió una evaluación inválida.");
  const value = data as Record<string, unknown>;
  const score = Number(value.score);
  if (!Number.isFinite(score)) throw new Error("Gemini devolvió una calificación inválida.");
  return {
    score: Math.max(0, Math.min(question.maxScore, score)),
    level: String(value.level ?? ""),
    feedback: String(value.feedback ?? "Evaluación generada por IA."),
    strengths: Array.isArray(value.strengths) ? value.strengths.map(String) : [],
    opportunities: Array.isArray(value.opportunities) ? value.opportunities.map(String) : [],
  };
}

export async function submitExamAttemptInPostgres(
  input: { attemptId?: string; examId?: string; studentId?: string; answers?: unknown },
  evaluateOpenAnswer: EvaluateOpenAnswer = evaluateOpenAnswerWithGeminiInPostgres,
  now = new Date(),
) {
  const attemptId = String(input.attemptId ?? "").trim();
  const examId = String(input.examId ?? "").trim();
  const studentId = String(input.studentId ?? "").trim();
  if (!attemptId || !examId || !studentId) throw new ExamWorkflowError("No se puede enviar un intento incompleto.");
  const exam = await loadExamDefinition(examId, false);
  if (!exam) throw new ExamWorkflowError("Examen no encontrado.", 404);
  const db = getDatabase();
  const accepted = await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt || !sameId(attempt.studentId, studentId) || attempt.examId !== examId) throw new ExamWorkflowError("Intento no autorizado.", 403);
    if (attempt.status === "Definitivo" || attempt.status === "Provisional") {
      const answerRows = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
      const evaluationRows = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId));
      return { terminal: resultFromRows(attempt, exam, answerRows, evaluationRows) } as const;
    }
    if (attempt.status === "Bloqueado") throw new ExamWorkflowError("El examen está bloqueado. Solicita al docente que lo desbloquee.", 409);
    if (attempt.status !== "Activo" && attempt.status !== "Evaluando") throw new ExamWorkflowError("El examen ya no está disponible para envío.", 409);
    if (attempt.status === "Activo") {
      if (now.getTime() > deadlineFor(attempt).getTime() + 60_000) throw new ExamWorkflowError("El tiempo del examen terminó y el envío llegó fuera del margen permitido. Solicita apoyo al docente.", 409);
      const answers = validateAnswerMap(input.answers, exam.questions, true);
      const acceptedAt = now.toISOString();
      for (const question of exam.questions) {
        const answer = answers[question.id] ?? "";
        const serialized = serializeAnswer(answer);
        const filled = Array.isArray(answer) ? answer.some((item) => item.trim()) : answer.trim().length > 0;
        await tx.insert(examAnswers).values({
          id: `answer-${randomUUID()}`, attemptId, questionId: question.id, studentId: attempt.studentId, answer: serialized,
          status: filled ? "Respondida" : "Sin_respuesta", score: null, evaluationMethod: question.evaluationMethod,
          feedback: filled ? null : "No se registró una respuesta.", aiStatus: question.evaluationMethod === "ai" && filled ? "Pendiente" : "Evaluada", updatedAt: acceptedAt,
        }).onConflictDoUpdate({
          target: [examAnswers.attemptId, examAnswers.questionId],
          set: {
            answer: serialized, status: filled ? "Respondida" : "Sin_respuesta", score: null,
            evaluationMethod: question.evaluationMethod, feedback: filled ? null : "No se registró una respuesta.",
            aiStatus: question.evaluationMethod === "ai" && filled ? "Pendiente" : "Evaluada", updatedAt: acceptedAt,
          },
        });
        if (question.evaluationMethod === "ai" && filled) {
          await tx.insert(aiEvaluations).values({
            id: `ai-${randomUUID()}`, attemptId, questionId: question.id, model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
            promptVersion: "1.0", input: { answer, rubric: question.rubric ?? null }, status: "Pendiente", score: null,
            feedback: null, breakdown: null, error: null, executedAt: null, approvedAt: null,
          }).onConflictDoUpdate({
            target: [aiEvaluations.attemptId, aiEvaluations.questionId],
            set: { model: process.env.GEMINI_MODEL || "gemini-3.6-flash", input: { answer, rubric: question.rubric ?? null }, status: "Pendiente", score: null, feedback: null, breakdown: null, error: null, executedAt: null, approvedAt: null },
          });
        }
      }
      const [updated] = await tx.update(examAttempts).set({ status: "Evaluando", finishedAt: acceptedAt, locked: false, lockedAt: null, updatedAt: acceptedAt }).where(eq(examAttempts.id, attemptId)).returning();
      await insertAuditEvent(tx, "exam_submission_accepted", updated!, { reason: "student_submit" }, acceptedAt);
    }
    const attemptRow = (await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1))[0];
    if (!attemptRow) throw new ExamWorkflowError("No se encontró el intento después de aceptar el envío.", 409);
    const answerRows = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
    // A recovered expired attempt reaches Evaluando with its autosaved answers,
    // before a normal submission has created the durable AI evaluation records.
    const recoveredAnswers = storedAnswers(answerRows);
    for (const question of exam.questions.filter((item) => item.evaluationMethod === "ai")) {
      const answer = recoveredAnswers[question.id];
      if (!answer || (Array.isArray(answer) && !answer.some((item) => item.trim()))) continue;
      await tx.insert(aiEvaluations).values({
        id: `ai-${randomUUID()}`, attemptId, questionId: question.id,
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash", promptVersion: "1.0",
        input: { answer, rubric: question.rubric ?? null }, status: "Pendiente",
      }).onConflictDoNothing({ target: [aiEvaluations.attemptId, aiEvaluations.questionId] });
    }
    const evaluationRows = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId));
    return { attempt: attemptRow, answers: storedAnswers(answerRows), answerRows, evaluationRows } as const;
  });
  if ("terminal" in accepted) return { result: accepted.terminal, source: "postgres", recovered: true, partialId: exam.partialId };

  const claimed = await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt || attempt.status !== "Evaluando") throw new ExamWorkflowError("El intento cambió durante la evaluación.", 409);
    const pendingRows = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId));
    const busy = pendingRows.some((row) => row.status === "Procesando" && row.executedAt && now.getTime() - Date.parse(row.executedAt) < AI_PROCESSING_LEASE_MS);
    if (busy) throw new ExamWorkflowError("La evaluación sigue en proceso. Vuelve a consultar el resultado en un momento.", 409);
    const staleAt = new Date(now.getTime() - AI_PROCESSING_LEASE_MS).toISOString();
    const claimable = pendingRows.filter((row) => row.status !== "Evaluada");
    const claimedRows = [];
    for (const row of claimable) {
      const [claimedRow] = await tx.update(aiEvaluations).set({ status: "Procesando", executedAt: now.toISOString(), error: null })
        .where(and(eq(aiEvaluations.id, row.id), sql`(${aiEvaluations.status} <> 'Procesando' OR ${aiEvaluations.executedAt} IS NULL OR ${aiEvaluations.executedAt} < ${staleAt})`))
        .returning();
      if (claimedRow) claimedRows.push(claimedRow);
    }
    const questionMap = new Map(exam.questions.map((question) => [question.id, question]));
    return { attempt, answerRows: await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId)), claimedRows, questionMap };
  });

  for (const claim of claimed.claimedRows) {
    const question = claimed.questionMap.get(claim.questionId);
    const stored = claimed.answerRows.find((row) => row.questionId === claim.questionId);
    if (!question || !stored) continue;
    const answer = parseStoredAnswer(stored.answer);
    try {
      const evaluation = await evaluateOpenAnswer(exam, question, answer);
      if (!Number.isFinite(evaluation.score) || evaluation.score < 0 || evaluation.score > question.maxScore) throw new Error("La evaluación de IA devolvió un puntaje inválido.");
      const evaluatedAt = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx.update(aiEvaluations).set({ status: "Evaluada", score: String(evaluation.score), feedback: evaluation.feedback, breakdown: evaluation, error: null, executedAt: evaluatedAt })
          .where(and(eq(aiEvaluations.id, claim.id), eq(aiEvaluations.status, "Procesando")));
        await tx.update(examAnswers).set({ status: "Respondida", score: String(evaluation.score), evaluationMethod: "ai", feedback: evaluation.feedback, aiStatus: "Evaluada", updatedAt: evaluatedAt })
          .where(and(eq(examAnswers.attemptId, attemptId), eq(examAnswers.questionId, claim.questionId)));
      });
    } catch (error) {
      await db.update(aiEvaluations).set({ status: "Pendiente", error: String(error instanceof Error ? error.message : error).slice(0, 500), executedAt: null })
        .where(and(eq(aiEvaluations.id, claim.id), eq(aiEvaluations.status, "Procesando")));
    }
  }

  const finalized = await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt) throw new ExamWorkflowError("No se encontró el intento.", 404);
    if (attempt.status === "Definitivo" || attempt.status === "Provisional") {
      const answers = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
      const evaluations = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId));
      return { result: resultFromRows(attempt, exam, answers, evaluations), source: "postgres" };
    }
    const answers = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
    const evaluations = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId));
    const result = resultFromRows(attempt, exam, answers, evaluations);
    for (const item of result.items) {
      await tx.update(examAnswers).set({ score: item.score === null ? null : String(item.score), feedback: item.feedback })
        .where(and(eq(examAnswers.attemptId, attemptId), eq(examAnswers.questionId, item.questionId)));
    }
    const finalizedAt = new Date().toISOString();
    const [finalized] = await tx.update(examAttempts).set({
      status: result.aiPending ? "Provisional" : "Definitivo",
      automaticScore: String(result.automaticScore),
      aiScore: String(result.aiScore ?? 0),
      totalScore: result.totalScore === null ? null : String(result.totalScore),
      gradeOnTen: result.grade10 === null ? null : String(result.grade10),
      aiPending: result.aiPending,
      locked: false,
      lockedAt: null,
      updatedAt: finalizedAt,
    }).where(eq(examAttempts.id, attemptId)).returning();
    const finalResult = resultFromRows(finalized ?? attempt, exam, answers, evaluations);
    await insertAuditEvent(tx, result.aiPending ? "exam_submission_provisional" : "exam_submission_finalized", finalized ?? attempt, {
      automaticScore: result.automaticScore,
      aiPending: result.aiPending,
      totalScore: result.totalScore,
    }, finalizedAt);
    return { result: finalResult, source: "postgres", recovered: accepted.attempt.status === "Evaluando" };
  });
  return { ...finalized, partialId: exam.partialId };
}

export async function reevaluateOpenAnswerInPostgres(
  input: { attemptId?: string; questionId?: string },
  evaluateOpenAnswer: EvaluateOpenAnswer = evaluateOpenAnswerWithGeminiInPostgres,
  now = new Date(),
) {
  const attemptId = String(input.attemptId ?? "").trim();
  const questionId = String(input.questionId ?? "").trim();
  if (!attemptId || !questionId) throw new ExamWorkflowError("Intento y reactivo son obligatorios.");

  const db = getDatabase();
  const [snapshot] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
  if (!snapshot) throw new ExamWorkflowError("No se encontró el intento.", 404);
  const exam = await loadExamDefinition(snapshot.examId, false);
  if (!exam) throw new ExamWorkflowError("No se encontró el examen del intento.", 404);
  const question = exam.questions.find((item) => item.id === questionId);
  if (!question || question.evaluationMethod !== "ai") throw new ExamWorkflowError("El reactivo no corresponde a una pregunta abierta evaluada con IA.", 400);

  const claim = await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt) throw new ExamWorkflowError("No se encontró el intento.", 404);
    if (attempt.examId !== exam.id) throw new ExamWorkflowError("El reactivo no pertenece a este intento.", 403);
    if (attempt.manualGradeLocked) throw new ExamWorkflowError("La calificación final fue fijada manualmente. Quita ese ajuste antes de re-evaluar.", 409);
    if (attempt.status === "Definitivo") {
      const [savedAnswer] = await tx.select().from(examAnswers).where(and(eq(examAnswers.attemptId, attemptId), eq(examAnswers.questionId, questionId))).limit(1);
      return { terminal: { ok: true, attemptId, studentId: attempt.studentId, examId: attempt.examId, partialId: attempt.partialId, questionId, aiPending: false, alreadyEvaluated: true, evaluation: { score: Number(savedAnswer?.score ?? 0), feedback: savedAnswer?.feedback ?? "La respuesta ya quedó evaluada." } } } as const;
    }
    if (attempt.status !== "Provisional") throw new ExamWorkflowError("El intento no está pendiente de revisión con IA.", 409);

    const [answer] = await tx.select().from(examAnswers).where(and(
      eq(examAnswers.attemptId, attemptId), eq(examAnswers.questionId, questionId),
    )).for("update").limit(1);
    if (!answer) throw new ExamWorkflowError("No se encontró la respuesta guardada.", 404);
    const value = parseStoredAnswer(answer.answer);
    const empty = value === "" || (Array.isArray(value) && value.every((item) => !item.trim()));
    if (empty) throw new ExamWorkflowError("No se puede evaluar un reactivo sin respuesta.", 409);

    const [existing] = await tx.select().from(aiEvaluations).where(and(
      eq(aiEvaluations.attemptId, attemptId), eq(aiEvaluations.questionId, questionId),
    )).for("update").limit(1);
    if (existing?.status === "Evaluada") throw new ExamWorkflowError("La respuesta ya cuenta con una evaluación guardada.", 409);
    if (existing?.status === "Procesando" && existing.executedAt && now.getTime() - Date.parse(existing.executedAt) < AI_PROCESSING_LEASE_MS) {
      throw new ExamWorkflowError("La evaluación ya está en proceso. Actualiza el reporte en un momento.", 409);
    }

    const evaluationId = existing?.id ?? `ai-${randomUUID()}`;
    if (existing) {
      await tx.update(aiEvaluations).set({ status: "Procesando", executedAt: now.toISOString(), error: null })
        .where(eq(aiEvaluations.id, existing.id));
    } else {
      await tx.insert(aiEvaluations).values({
        id: evaluationId, attemptId, questionId, model: process.env.GEMINI_MODEL || "gemini-3.6-flash", promptVersion: "1.0",
        input: { answer: value, rubric: question.rubric ?? null }, status: "Procesando", score: null, feedback: null,
        breakdown: null, error: null, executedAt: now.toISOString(), approvedAt: null,
      });
    }
    return { attempt, answer, value, evaluationId } as const;
  });

  if ("terminal" in claim) return claim.terminal;

  let evaluation: GeminiEvaluation;
  try {
    evaluation = await evaluateOpenAnswer(exam, question, claim.value);
    if (!Number.isFinite(evaluation.score) || evaluation.score < 0 || evaluation.score > question.maxScore) {
      throw new Error("La evaluación de IA devolvió un puntaje inválido.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo evaluar la respuesta.";
    const status = error instanceof ExamWorkflowError ? error.status : 502;
    const failedAt = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx.update(aiEvaluations).set({ status: "Pendiente", error: message.slice(0, 500), executedAt: null })
        .where(and(eq(aiEvaluations.id, claim.evaluationId), eq(aiEvaluations.status, "Procesando")));
      await tx.insert(auditEvents).values({
        id: `event-${randomUUID()}`, type: "exam_ai_reevaluation_failed", entity: "INTENTOS", entityId: attemptId,
        partialId: claim.attempt.partialId, studentId: claim.attempt.studentId, actorId: "docente",
        details: { questionId, error: message.slice(0, 500) }, occurredAt: failedAt,
      });
    });
    throw new ExamWorkflowError(message, status);
  }

  const finalized = await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt) throw new ExamWorkflowError("No se encontró el intento.", 404);
    const [currentEvaluation] = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.id, claim.evaluationId)).for("update").limit(1);
    if (!currentEvaluation || currentEvaluation.status !== "Procesando") throw new ExamWorkflowError("La evaluación cambió mientras se procesaba.", 409);
    if (attempt.manualGradeLocked) {
      await tx.update(aiEvaluations).set({ status: "Pendiente", error: "El docente fijó manualmente la calificación final.", executedAt: null })
        .where(eq(aiEvaluations.id, claim.evaluationId));
      return { blocked: true as const };
    }

    const evaluatedAt = new Date().toISOString();
    const savedEvaluation: GeminiEvaluation = {
      score: evaluation.score,
      level: evaluation.level,
      feedback: evaluation.feedback,
      strengths: evaluation.strengths ?? [],
      opportunities: evaluation.opportunities ?? [],
    };
    await tx.update(aiEvaluations).set({
      status: "Evaluada", score: String(evaluation.score), feedback: evaluation.feedback,
      breakdown: savedEvaluation, error: null, executedAt: evaluatedAt,
    }).where(eq(aiEvaluations.id, claim.evaluationId));
    await tx.update(examAnswers).set({
      status: "Respondida", score: String(evaluation.score), evaluationMethod: "ai", feedback: evaluation.feedback,
      aiStatus: "Evaluada", updatedAt: evaluatedAt,
    }).where(and(eq(examAnswers.attemptId, attemptId), eq(examAnswers.questionId, questionId)));

    const answerRows = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
    const evaluationRows = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId));
    const result = resultFromRows(attempt, exam, answerRows, evaluationRows);
    const nextStatus = result.aiPending ? "Provisional" : "Definitivo";
    const [updatedAttempt] = await tx.update(examAttempts).set({
      status: nextStatus,
      automaticScore: String(result.automaticScore),
      aiScore: String(result.aiScore ?? 0),
      totalScore: result.totalScore === null ? null : String(result.totalScore),
      gradeOnTen: result.grade10 === null ? null : String(result.grade10),
      aiPending: result.aiPending,
      updatedAt: evaluatedAt,
    }).where(eq(examAttempts.id, attemptId)).returning();
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`, type: "exam_ai_answer_reevaluated", entity: "INTENTOS", entityId: attemptId,
      partialId: attempt.partialId, studentId: attempt.studentId, actorId: "docente",
      details: { questionId, score: evaluation.score, aiPending: result.aiPending }, occurredAt: evaluatedAt,
    });
    return { blocked: false as const, result: {
      ok: true,
      attemptId,
      studentId: attempt.studentId,
      examId: attempt.examId,
      partialId: attempt.partialId,
      questionId,
      evaluation: savedEvaluation,
      aiPending: result.aiPending,
      automaticScore: result.automaticScore,
      aiScore: result.aiScore,
      totalScore: result.totalScore,
      grade10: result.grade10,
      status: updatedAttempt?.status ?? nextStatus,
    } };
  });
  if (finalized.blocked) throw new ExamWorkflowError("La calificación final fue fijada manualmente; la respuesta no se actualizó.", 409);
  return finalized.result;
}

export async function updateManualExamScoresInPostgres(input: {
  attemptId?: string;
  scores?: Array<{ questionId?: string; score?: number }>;
  manualGradeLocked?: boolean;
  manualGradeOnTen?: number | null;
  reason?: string;
}, now = new Date()) {
  const attemptId = String(input.attemptId ?? "").trim();
  const scores = Array.isArray(input.scores) ? input.scores : [];
  const reason = String(input.reason ?? "").trim();
  const hasGradeSetting = typeof input.manualGradeLocked === "boolean";
  const manualGradeLocked = hasGradeSetting ? input.manualGradeLocked! : undefined;
  const manualGradeOnTen = input.manualGradeOnTen === null || input.manualGradeOnTen === undefined ? null : Number(input.manualGradeOnTen);
  if (!attemptId || (!scores.length && !hasGradeSetting) || !reason) throw new ExamWorkflowError("Selecciona cambios y escribe el motivo del ajuste.");
  if (scores.length > 100 || reason.length > 500) throw new ExamWorkflowError("La solicitud de ajuste excede el tamaño permitido.");
  if (manualGradeLocked && (manualGradeOnTen === null || !Number.isFinite(manualGradeOnTen) || manualGradeOnTen < 0 || manualGradeOnTen > 10)) {
    throw new ExamWorkflowError("La calificación final debe estar entre 0 y 10.");
  }
  const submitted = new Map<string, number>();
  for (const item of scores) {
    const questionId = String(item.questionId ?? "").trim();
    const score = Number(item.score);
    if (!questionId || !Number.isFinite(score) || submitted.has(questionId)) throw new ExamWorkflowError("Revisa los puntajes ingresados.");
    submitted.set(questionId, score);
  }
  const db = getDatabase();
  const [snapshot] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
  if (!snapshot) throw new ExamWorkflowError("No se encontró el intento.", 404);
  const exam = await loadExamDefinition(snapshot.examId, false);
  if (!exam) throw new ExamWorkflowError("No se encontró el examen.", 404);
  return db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt) throw new ExamWorkflowError("No se encontró el intento.", 404);
    if (attempt.examId !== snapshot.examId) throw new ExamWorkflowError("El intento cambió mientras se editaba.", 409);
    if (!["Definitivo", "Provisional"].includes(String(attempt.status))) throw new ExamWorkflowError("Finaliza el examen antes de editar sus puntajes.", 409);
    const questions = new Map(exam.questions.map((question) => [question.id, question]));
    const answers = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
    for (const [questionId, score] of submitted) {
      const question = questions.get(questionId);
      const answer = answerByQuestion.get(questionId);
      if (!question || !answer) throw new ExamWorkflowError("Sólo puedes ajustar reactivos con respuesta guardada.", 400);
      if (score < 0 || score > question.maxScore) throw new ExamWorkflowError(`El puntaje de la pregunta ${question.order} debe estar entre 0 y ${question.maxScore}.`);
    }
    const occurredAt = now.toISOString();
    const changes: Array<{ questionId: string; previousScore: number | null; score: number }> = [];
    for (const [questionId, score] of submitted) {
      const answer = answerByQuestion.get(questionId)!;
      changes.push({ questionId, previousScore: answer.manualScore == null ? answer.score == null ? null : Number(answer.score) : Number(answer.manualScore), score });
      await tx.update(examAnswers).set({ manualScore: String(score), manualScoreUpdatedAt: occurredAt, updatedAt: occurredAt })
        .where(and(eq(examAnswers.attemptId, attemptId), eq(examAnswers.questionId, questionId)));
    }
    const updatedAnswers = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
    const evaluationRows = await tx.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId));
    const result = resultFromRows({ ...attempt, manualGradeLocked: false, manualGradeOnTen: null }, exam, updatedAnswers, evaluationRows);
    const status = result.aiPending ? "Provisional" : "Definitivo";
    const nextManualGradeLocked = manualGradeLocked ?? attempt.manualGradeLocked;
    const nextManualGradeOnTen = manualGradeLocked === undefined ? attempt.manualGradeOnTen : manualGradeLocked ? manualGradeOnTen : null;
    const finalGrade = nextManualGradeLocked && nextManualGradeOnTen !== null ? nextManualGradeOnTen : result.grade10;
    await tx.update(examAttempts).set({
      status, automaticScore: String(result.automaticScore), aiScore: String(result.aiScore ?? 0),
      totalScore: result.totalScore === null ? null : String(result.totalScore),
      gradeOnTen: finalGrade === null ? null : String(finalGrade), manualGradeOnTen: nextManualGradeOnTen === null ? null : String(nextManualGradeOnTen),
      manualGradeLocked: nextManualGradeLocked, aiPending: result.aiPending, updatedAt: occurredAt,
    }).where(eq(examAttempts.id, attemptId));
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`, type: "exam_manual_scores_updated", entity: "INTENTOS", entityId: attemptId,
      partialId: attempt.partialId, studentId: attempt.studentId, actorId: "docente",
      details: { reason, changes, manualGrade: { previousLocked: attempt.manualGradeLocked, previousGradeOnTen: attempt.manualGradeOnTen, locked: nextManualGradeLocked, gradeOnTen: nextManualGradeOnTen } }, occurredAt,
    });
    return { attemptId, partialId: attempt.partialId, result: { ...result, grade10: finalGrade }, status, manualGradeLocked: nextManualGradeLocked, manualGradeOnTen: nextManualGradeOnTen === null ? null : Number(nextManualGradeOnTen) };
  });
}

export async function finalizeExamAttemptByTeacherInPostgres(input: { attemptId?: string }, now = new Date()) {
  const attemptId = String(input.attemptId ?? "").trim();
  if (!attemptId) throw new ExamWorkflowError("Selecciona un intento para finalizar.");
  const db = getDatabase();
  const [snapshot] = await db.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).limit(1);
  if (!snapshot) throw new ExamWorkflowError("No se encontró el intento.", 404);
  const exam = await loadExamDefinition(snapshot.examId, false);
  if (!exam) throw new ExamWorkflowError("No se encontró el examen.", 404);
  const accepted = await db.transaction(async (tx) => {
    const [attempt] = await tx.select().from(examAttempts).where(eq(examAttempts.id, attemptId)).for("update").limit(1);
    if (!attempt) throw new ExamWorkflowError("No se encontró el intento.", 404);
    if (attempt.examId !== snapshot.examId) throw new ExamWorkflowError("El intento cambió mientras se finalizaba.", 409);
    if (["Definitivo", "Provisional"].includes(String(attempt.status))) return { attempt, alreadyFinal: true } as const;
    if (!["Activo", "Bloqueado", "Evaluando"].includes(String(attempt.status))) throw new ExamWorkflowError("El intento no se puede finalizar.", 409);
    const answers = await tx.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId));
    const saved = new Map(answers.map((answer) => [answer.questionId, answer]));
    const finalizedAt = now.toISOString();
    for (const question of exam.questions) {
      const previous = saved.get(question.id);
      const value = previous ? parseStoredAnswer(previous.answer) : "";
      const hasAnswer = Array.isArray(value) ? value.some((item) => item.trim()) : value.trim().length > 0;
      const fields = {
        answer: previous?.answer ?? "", status: hasAnswer ? "Respondida" : "Sin_respuesta",
        evaluationMethod: question.evaluationMethod, feedback: hasAnswer ? previous?.feedback ?? null : "No se registró una respuesta.",
        aiStatus: question.evaluationMethod === "ai" && hasAnswer ? "Pendiente" : "Evaluada", updatedAt: finalizedAt,
      };
      if (previous) await tx.update(examAnswers).set(fields).where(and(eq(examAnswers.attemptId, attemptId), eq(examAnswers.questionId, question.id)));
      else await tx.insert(examAnswers).values({
        id: `answer-${randomUUID()}`, attemptId, questionId: question.id, studentId: attempt.studentId,
        score: question.evaluationMethod === "ai" && hasAnswer ? null : "0", ...fields,
      });
      if (question.evaluationMethod === "ai" && hasAnswer) {
        await tx.insert(aiEvaluations).values({
          id: `ai-${randomUUID()}`, attemptId, questionId: question.id, model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
          promptVersion: "1.0", input: { answer: value, rubric: question.rubric ?? null }, status: "Pendiente",
        }).onConflictDoNothing({ target: [aiEvaluations.attemptId, aiEvaluations.questionId] });
      }
    }
    const [updated] = await tx.update(examAttempts).set({ status: "Evaluando", finishedAt: attempt.finishedAt ?? finalizedAt, locked: false, lockedAt: null, updatedAt: finalizedAt })
      .where(eq(examAttempts.id, attemptId)).returning();
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`, type: "exam_teacher_finalization_accepted", entity: "INTENTOS", entityId: attemptId,
      partialId: attempt.partialId, studentId: attempt.studentId, actorId: "docente",
      details: { previousStatus: attempt.status, savedAnswers: answers.filter((answer) => String(answer.answer ?? "").trim()).length }, occurredAt: finalizedAt,
    });
    return { attempt: updated ?? attempt, alreadyFinal: false } as const;
  });
  if (accepted.alreadyFinal) {
    const [answers, evaluations] = await Promise.all([
      db.select().from(examAnswers).where(eq(examAnswers.attemptId, attemptId)),
      db.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, attemptId)),
    ]);
    return { result: resultFromRows(accepted.attempt, exam, answers, evaluations), partialId: accepted.attempt.partialId, status: accepted.attempt.status };
  }
  const finalized = await submitExamAttemptInPostgres({ attemptId, examId: accepted.attempt.examId, studentId: accepted.attempt.studentId, answers: {} });
  return { ...finalized, partialId: accepted.attempt.partialId };
}

export async function getTeacherExamResultsInPostgres(options: { includeInProgress?: boolean } = {}) {
  const db = getDatabase();
  const [studentRows, allExamRows, assignmentRows, attemptRows] = await Promise.all([
    db.select().from(students).orderBy(asc(students.grade), asc(students.group), asc(students.name)),
    db.select().from(exams).orderBy(asc(exams.createdAt), asc(exams.id)),
    db.select().from(examAssignments),
    db.select().from(examAttempts).where(inArray(examAttempts.status, options.includeInProgress
      ? ["Definitivo", "Provisional", ...ACTIVE_STATES] : ["Definitivo", "Provisional"])),
  ]);
  const publishedExams = allExamRows.filter((exam) => exam.status === "Publicado");
  const publishedIds = publishedExams.map((exam) => exam.id);
  const relevantExamIds = Array.from(new Set([...publishedIds, ...attemptRows.map((attempt) => attempt.examId)]));
  if (!relevantExamIds.length) return { students: [], exams: [], results: [] };

  const [questionRows, answerRows, evaluationRows] = await Promise.all([
    db.select().from(examQuestions).where(and(inArray(examQuestions.examId, relevantExamIds), ACTIVE_QUESTION)).orderBy(asc(examQuestions.order), asc(examQuestions.id)),
    attemptRows.length ? db.select().from(examAnswers).where(inArray(examAnswers.attemptId, attemptRows.map((attempt) => attempt.id))) : Promise.resolve([]),
    attemptRows.length ? db.select().from(aiEvaluations).where(inArray(aiEvaluations.attemptId, attemptRows.map((attempt) => attempt.id))) : Promise.resolve([]),
  ]);
  const studentById = new Map(studentRows.map((student) => [student.id.trim().toUpperCase(), student]));
  const examById = new Map(allExamRows.map((exam) => [exam.id, exam]));
  const assignmentStudentsByExam = new Map<string, Set<string>>();
  for (const assignment of assignmentRows.filter((row) => row.status?.trim().toLowerCase() === "activo")) {
    const id = assignment.studentId.trim().toUpperCase();
    const collection = assignmentStudentsByExam.get(assignment.examId) ?? new Set<string>();
    collection.add(id);
    assignmentStudentsByExam.set(assignment.examId, collection);
  }
  const questionsByExam = new Map<string, typeof questionRows>();
  for (const question of questionRows) {
    const collection = questionsByExam.get(question.examId) ?? [];
    collection.push(question);
    questionsByExam.set(question.examId, collection);
  }
  const questionById = new Map(questionRows.map((question) => [question.id, question]));
  const answersByAttempt = new Map<string, typeof answerRows>();
  for (const answer of answerRows) {
    const collection = answersByAttempt.get(answer.attemptId) ?? [];
    collection.push(answer);
    answersByAttempt.set(answer.attemptId, collection);
  }
  const evaluationsByAttempt = new Map<string, typeof evaluationRows>();
  for (const evaluation of evaluationRows) {
    const collection = evaluationsByAttempt.get(evaluation.attemptId) ?? [];
    collection.push(evaluation);
    evaluationsByAttempt.set(evaluation.attemptId, collection);
  }

  return {
    students: studentRows.map((student) => ({ studentId: student.id, studentName: student.name, grade: student.grade ?? "", group: student.group ?? "" })),
    exams: publishedExams.map((exam) => {
      const eligible = new Set<string>();
      for (const student of studentRows) {
        if (String(student.grade ?? "") === String(exam.grade ?? "")
          && (String(exam.group ?? "").toUpperCase() === "TODOS" || String(student.group ?? "") === String(exam.group ?? ""))) {
          eligible.add(`${student.grade ?? ""} ${student.group ?? ""}`.trim());
        }
      }
      for (const studentId of assignmentStudentsByExam.get(exam.id) ?? []) {
        const student = studentById.get(studentId);
        if (student) eligible.add(`${student.grade ?? ""} ${student.group ?? ""}`.trim());
      }
      return {
        examId: exam.id, examName: exam.name, partialId: exam.partialId, grade: exam.grade ?? "", group: exam.group ?? "",
        groups: [...eligible].filter(Boolean).sort((a, b) => a.localeCompare(b, "es-MX", { numeric: true })),
        questions: (questionsByExam.get(exam.id) ?? []).map((question) => ({ questionId: question.id, order: Number(question.order ?? 0), maxScore: Number(question.maxScore ?? 0), prompt: question.prompt })),
      };
    }),
    results: attemptRows.flatMap((attempt) => {
      const student = studentById.get(attempt.studentId.trim().toUpperCase());
      const exam = examById.get(attempt.examId);
      if (!exam) return [];
      const completed = attempt.status === "Definitivo" || attempt.status === "Provisional";
      const savedAnswers = answersByAttempt.get(attempt.id) ?? [];
      const evaluatedItems = completed ? new Map(resultFromRows(attempt,
        toExamDefinition(exam, (questionsByExam.get(exam.id) ?? []).map(toExamQuestion)),
        savedAnswers, evaluationsByAttempt.get(attempt.id) ?? []).items.map((item) => [item.questionId, item])) : new Map();
      const evaluationByQuestion = new Map((evaluationsByAttempt.get(attempt.id) ?? []).map((item) => [item.questionId, item]));
      return [{
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName: student?.name ?? attempt.studentId,
        grade: student?.grade ?? exam.grade ?? "",
        group: attempt.group || student?.group || "",
        examId: attempt.examId,
        examName: exam.name,
        partialId: attempt.partialId,
        status: attempt.status,
        submissionState: completed ? "Entregado" : attempt.status === "Evaluando"
          ? Date.now() - Date.parse(attempt.updatedAt ?? attempt.finishedAt ?? "") > AI_PROCESSING_LEASE_MS
            ? "Envío aceptado; evaluación interrumpida" : "Envío aceptado; evaluación en curso"
          : attempt.status === "Bloqueado" ? "Bloqueado; sin enviar"
          : Date.now() > deadlineFor(attempt).getTime() + 60_000 ? "Tiempo agotado; sin enviar" : "En curso; sin enviar",
        score: attempt.totalScore === null ? null : Number(attempt.totalScore),
        grade10: attempt.gradeOnTen === null ? null : Number(attempt.gradeOnTen),
        manualGradeLocked: attempt.manualGradeLocked,
        manualGradeOnTen: attempt.manualGradeOnTen === null ? null : Number(attempt.manualGradeOnTen),
        automaticScore: attempt.automaticScore === null ? null : Number(attempt.automaticScore),
        aiPending: attempt.aiPending ?? false,
        submittedAt: attempt.finishedAt ?? attempt.updatedAt ?? attempt.startedAt ?? "",
        answers: (answersByAttempt.get(attempt.id) ?? []).map((answer) => {
          const question = questionById.get(answer.questionId);
          const ai = evaluationByQuestion.get(answer.questionId);
          const aiPending = question?.evaluationMethod === "ai" && ai?.status !== "Evaluada";
          const savedAnswer = parseStoredAnswer(answer.answer);
          const evaluated = evaluatedItems.get(answer.questionId);
          return {
            questionId: answer.questionId,
            answer: Array.isArray(savedAnswer) ? savedAnswer.join(", ") : savedAnswer,
            score: completed ? evaluated?.score ?? null : null,
            manualScore: answer.manualScore == null ? null : Number(answer.manualScore),
            maxScore: Number(question?.maxScore ?? 0),
            scoreSource: answer.manualScore == null ? question?.evaluationMethod === "ai" ? "IA" : "Automática" : "Manual",
            feedback: evaluated?.feedback ?? (ai?.status === "Evaluada" ? ai.feedback ?? answer.feedback ?? "" : answer.feedback ?? ""),
            status: !completed ? "Guardada; sin evaluar" : evaluated?.status === "pendiente_ia" || aiPending && evaluated?.score == null ? "Pendiente"
              : question?.evaluationMethod === "ai" && ai?.status === "Evaluada" ? "Evaluada" : evaluated?.status ?? answer.aiStatus ?? answer.status ?? "",
          };
        }),
      }];
    }),
  };
}

export async function revokeExamAttemptsInPostgres(input: { studentId?: string; examId?: string }) {
  const studentId = String(input.studentId ?? "").trim();
  const examId = String(input.examId ?? "").trim();
  if (!studentId || !examId) throw new ExamWorkflowError("Alumno y examen son obligatorios.");
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [exam] = await tx.select().from(exams).where(eq(exams.id, examId)).for("update").limit(1);
    if (!exam) throw new ExamWorkflowError("Examen no encontrado.", 404);
    const attempts = await tx.select().from(examAttempts).where(and(
      eq(examAttempts.examId, examId),
      sql`upper(trim(${examAttempts.studentId})) = ${studentId.toUpperCase()}`,
      inArray(examAttempts.status, ["Definitivo", "Provisional"]),
    )).for("update");
    if (!attempts.length) throw new ExamWorkflowError("El alumno ya no tiene intentos entregados de este examen para revocar. Actualiza la búsqueda e inténtalo de nuevo.", 409);

    const attemptIds = attempts.map((attempt) => attempt.id);
    const deletedAnswers = await tx.delete(examAnswers).where(inArray(examAnswers.attemptId, attemptIds)).returning({ id: examAnswers.id });
    const deletedAi = await tx.delete(aiEvaluations).where(inArray(aiEvaluations.attemptId, attemptIds)).returning({ id: aiEvaluations.id });
    const deletedAttempts = await tx.delete(examAttempts).where(inArray(examAttempts.id, attemptIds)).returning({ id: examAttempts.id });
    const revokedAt = new Date().toISOString();
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`,
      type: "exam_revoked",
      entity: "EXAMENES",
      entityId: examId,
      partialId: exam.partialId,
      studentId,
      actorId: "docente",
      details: {
        attemptIds,
        deletedAnswers: deletedAnswers.length,
        deletedAi: deletedAi.length,
        deletedAttempts: deletedAttempts.length,
      },
      occurredAt: revokedAt,
    });
    return {
      ok: true,
      examId,
      partialId: exam.partialId,
      studentId,
      deletedAnswers: deletedAnswers.length,
      deletedAi: deletedAi.length,
      deletedAttempts: deletedAttempts.length,
      canRetake: true,
    };
  });
}
