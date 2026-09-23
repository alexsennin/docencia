export type ExamOption = {
  value: string;
  label: string;
};

export type RubricCriterion = {
  criterion: string;
  description: string;
};

export type ExamRubric = {
  version: string;
  aggregation: "average_criteria_level";
  maxScore: number;
  levels: Array<{ level: string; score: number }>;
  criteria: RubricCriterion[];
};

export type ExamQuestion = {
  id: string;
  order: number;
  topic: string;
  type: "opcion_multiple" | "clasificacion" | "abierta";
  prompt: string;
  options: ExamOption[];
  correctAnswer?: string | string[];
  maxScore: number;
  evaluationMethod: "automatic" | "ai";
  rubric?: ExamRubric;
};

export type ExamDefinition = {
  id: string;
  partialId: string;
  name: string;
  subject: string;
  grade: string;
  group: string;
  status: "Publicado" | "Borrador" | "Cerrado";
  durationMinutes: number;
  maxScore: number;
  requiresFullscreen: boolean;
  instructions: string;
  questions: ExamQuestion[];
};

export type Student = {
  id: string;
  name: string;
  grade: string;
  group: string;
};

export type PublicQuestion = Omit<ExamQuestion, "correctAnswer" | "rubric">;
export type PublicExam = Omit<ExamDefinition, "questions"> & { questions: PublicQuestion[] };

export type AnswerMap = Record<string, string | string[]>;

export type ItemResult = {
  questionId: string;
  order: number;
  maxScore: number;
  score: number | null;
  status: "correcta" | "incorrecta" | "sin_respuesta" | "pendiente_ia";
  feedback: string;
  strengths?: string[];
  opportunities?: string[];
};

export type ExamResult = {
  attemptId: string;
  examId: string;
  studentId: string;
  automaticScore: number;
  aiScore: number | null;
  totalScore: number | null;
  grade10: number | null;
  maxScore: number;
  aiPending: boolean;
  items: ItemResult[];
  submittedAt: string;
};
