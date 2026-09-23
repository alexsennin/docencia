import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (hasSheetsBridge()) await sheetsBridge("examEvent", payload);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el evento." }, { status: 500 });
  }
}
