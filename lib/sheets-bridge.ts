export function hasSheetsBridge() {
  return Boolean(process.env.GOOGLE_SHEETS_BRIDGE_URL && process.env.GOOGLE_SHEETS_BRIDGE_TOKEN);
}

export async function sheetsBridge<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const url = process.env.GOOGLE_SHEETS_BRIDGE_URL;
  const token = process.env.GOOGLE_SHEETS_BRIDGE_TOKEN;
  if (!url || !token) throw new Error("El puente seguro con Google Sheets aún no está configurado.");
  const requestBody = JSON.stringify({ action, payload, token });
  let response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody,
    redirect: "manual",
    cache: "no-store",
  });
  const redirectLocation = response.headers.get("location");
  if (redirectLocation && [301, 302, 303, 307, 308].includes(response.status)) {
    response = await fetch(new URL(redirectLocation, url), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
    });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(body?.error || `Sheets bridge respondió ${response.status}`);
  return (body?.data ?? body) as T;
}
