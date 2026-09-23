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

export function makeAiPrompt(exam: ExamDefinition, question: ExamQuestion, answer: string | string[]) {
  return `Eres evaluador docente de Español. Evalúa únicamente la respuesta del alumno usando la rúbrica proporcionada. No inventes datos. Devuelve JSON válido con score, level, feedback, strengths y opportunities. El score debe estar entre 0 y ${question.maxScore}. Examen: ${exam.name}. Reactivo: ${question.prompt}. Respuesta: ${JSON.stringify(answer)}. Rúbrica: ${JSON.stringify(question.rubric)}.`;
}

export async function evaluateOpenWithGemini(exam: ExamDefinition, question: ExamQuestion, answer: string | string[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const base = process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models";
  const response = await fetch(`${base}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: makeAiPrompt(exam, question, answer) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini respondió ${response.status}`);
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini no devolvió contenido");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as { score: number; level: string; feedback: string; strengths?: string[]; opportunities?: string[] };
}
