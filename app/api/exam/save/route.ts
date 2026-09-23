import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (!payload.attemptId || !payload.examId || !payload.studentId) return Response.json({ error: "Intento incompleto." }, { status: 400 });
    if (hasSheetsBridge()) await sheetsBridge("saveAnswers", payload);
    return Response.json({ ok: true, savedAt: new Date().toISOString(), source: hasSheetsBridge() ? "sheets" : "demo" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar las respuestas." }, { status: 500 });
  }
}
