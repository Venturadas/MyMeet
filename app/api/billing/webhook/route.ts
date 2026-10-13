import { NextResponse } from "next/server";
import {
  billingIsConfigured,
  processMercadoPagoNotification,
} from "@/lib/billing";
import { verifyMercadoPagoSignature } from "@/lib/billing-policy";

export const runtime = "nodejs";

function response(status: number) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function smallBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    throw new Error("body_too_large");
  if (!request.body) throw new Error("missing_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
  if (!billingIsConfigured()) return response(503);
  const url = new URL(request.url);
  const id = verifyMercadoPagoSignature(
    url,
    request.headers,
    process.env.MERCADO_PAGO_WEBHOOK_SECRET!,
  );
  if (!id) return response(401);
  let body: { type?: unknown; data?: { id?: unknown } };
  try {
    const parsed = await smallBody(request);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return response(400);
    body = parsed;
  } catch {
    return response(400);
  }
  if (String(body.data?.id) !== id || typeof body.type !== "string")
    return response(400);
  const queryTypes = url.searchParams.getAll("type");
  if (
    queryTypes.length > 1 ||
    (queryTypes.length === 1 && queryTypes[0] !== body.type)
  )
    return response(400);
  if (
    ![
      "subscription_preapproval",
      "subscription_authorized_payment",
      "payment",
    ].includes(body.type)
  )
    return response(200);
  try {
    await processMercadoPagoNotification(body.type, id);
    return response(200);
  } catch {
    // No body, email, provider response, tokens or secret-bearing URL in logs.
    // A retryable status lets Mercado Pago redeliver after transient failures.
    return response(503);
  }
}
