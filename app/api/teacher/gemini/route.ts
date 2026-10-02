import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import { getGeminiConfigPostgres, testGeminiConnectionPostgres } from "../../../../lib/ca-rubric-postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  const backend = getDataBackend();
  if (backend === "postgres") return Response.json({ ...(await getGeminiConfigPostgres()), managedBy: "server" }, { headers: { "Cache-Control": "no-store" } });
  if (!hasSheetsBridge()) return Response.json({ error: "La conexión con Apps Script no está disponible." }, { status: 503 });
  try {
    const settings = await sheetsBridge<{ configured: boolean; model: string }>("getGeminiConfig", {});
    return Response.json({ ...settings, managedBy: "appsscript" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar la configuración." }, { status: 502 }); }
}

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const body = await request.json() as { action?: string; apiKey?: string; model?: string };
    const backend = getDataBackend();
    if (backend === "postgres") {
      if (body.action === "test") return Response.json({ ...(await testGeminiConnectionPostgres()), message: "Conexión con Gemini verificada." }, { headers: { "Cache-Control": "no-store" } });
      return Response.json({ error: "La clave y el modelo se administran en las variables de entorno del servidor." }, { status: 409 });
    }
    if (!hasSheetsBridge()) return Response.json({ error: "La conexión con Apps Script no está disponible." }, { status: 503 });
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
