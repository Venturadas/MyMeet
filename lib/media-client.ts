"use client";
export async function mediaRequest(url: string, body: FormData | Record<string, unknown>, signal: AbortSignal) {
  const multipart = body instanceof FormData;
  const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: multipart ? undefined : { "Content-Type": "application/json" }, body: multipart ? body : JSON.stringify(body), signal });
  let result: Record<string, unknown>;
  try { result = await response.json(); }
  catch { throw new Error("Não foi possível concluir. Tente novamente."); }
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error.slice(0, 250) : "Não foi possível concluir. Tente novamente.");
  return result;
}
