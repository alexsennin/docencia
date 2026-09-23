import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (!hasSheetsBridge()) return Response.json({ error: "La conexión con Apps Script no está disponible." }, { status: 503 });
  try {
    const settings = await sheetsBridge<{ configured: boolean; model: string }>("getGeminiConfig", {});
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar la configuración." }, { status: 502 }); }
}

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (!hasSheetsBridge()) return Response.json({ error: "La conexión con Apps Script no está disponible." }, { status: 503 });
  try {
    const body = await request.json() as { action?: string; apiKey?: string; model?: string };
    if (body.action === "test") {
      const result = await sheetsBridge<{ connected: boolean; model: string }>("testGeminiConnection", {});
      return Response.json({ ...result, message: "Conexión con Gemini verificada." }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "save" || (body.apiKey !== undefined && typeof body.apiKey !== "string") || typeof body.model !== "string") {
      return Response.json({ error: "Revisa la clave y el modelo de Gemini." }, { status: 400 });
    }
    const settings = await sheetsBridge<{ configured: boolean; model: string }>("setGeminiConfig", { apiKey: body.apiKey || "", model: body.model });
    return Response.json({ ...settings, message: "Configuración guardada en las Propiedades de Apps Script." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la configuración." }, { status: 502 }); }
}
