import type { AnswerMap, ExamDefinition, ExamQuestion, ExamResult, ItemResult, PublicExam } from "./exam-types";

export function toPublicExam(exam: ExamDefinition): PublicExam {
  return {
    ...exam,
    questions: exam.questions.map((question) => Object.fromEntries(Object.entries(question).filter(([key]) => key !== "correctAnswer" && key !== "rubric")) as PublicExam["questions"][number]),
  };
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function scoreQuestion(question: ExamQuestion, answer: string | string[] | undefined): ItemResult {
  const empty = answer === undefined || answer === "" || (Array.isArray(answer) && answer.every((value) => !value));
  if (empty) return { questionId: question.id, order: question.order, maxScore: question.maxScore, score: 0, status: "sin_respuesta", feedback: "No se registró una respuesta." };
  if (question.evaluationMethod === "ai") return { questionId: question.id, order: question.order, maxScore: question.maxScore, score: null, status: "pendiente_ia", feedback: "Respuesta enviada a evaluación con IA y revisión docente." };
  const expected = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
  const received = Array.isArray(answer) ? answer : [answer];
  const correct = expected.length === received.length && expected.every((value, index) => normalize(value) === normalize(received[index]));
  return { questionId: question.id, order: question.order, maxScore: question.maxScore, score: correct ? question.maxScore : 0, status: correct ? "correcta" : "incorrecta", feedback: correct ? "Respuesta correcta." : "Revisa este concepto con tu docente." };
}

export function evaluateAutomatic(exam: ExamDefinition, answers: AnswerMap, attemptId: string, studentId: string): ExamResult {
  const items = exam.questions.map((question) => scoreQuestion(question, answers[question.id]));
  const automaticScore = items.filter((item) => item.status !== "pendiente_ia").reduce((sum, item) => sum + (item.score ?? 0), 0);
  const aiPending = items.some((item) => item.status === "pendiente_ia");
  return {
    attemptId,
    examId: exam.id,
    studentId,
    automaticScore,
    aiScore: null,
    totalScore: aiPending ? null : automaticScore,
    grade10: aiPending ? null : Number(((automaticScore / exam.maxScore) * 10).toFixed(2)),
    maxScore: exam.maxScore,
    aiPending,
    items,
    submittedAt: new Date().toISOString(),
  };
}

export async function evaluateOpenWithGemini(exam: ExamDefinition, question: ExamQuestion, answer: string | string[]): Promise<{ score: number; level: string; feedback: string; strengths?: string[]; opportunities?: string[] } | null> {
  void exam; void question; void answer;
  throw new Error("La evaluación Gemini sólo se ejecuta en el puente de Apps Script, con la clave de Script Properties.");
}
