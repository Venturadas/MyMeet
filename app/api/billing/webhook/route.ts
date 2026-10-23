import { NextResponse } from "next/server";
import {
  billingHasCredentials,
  processMercadoPagoNotification,
} from "@/lib/billing";
import { verifyMercadoPagoSignature } from "@/lib/billing-policy";
import { operationalFailure } from "@/lib/operations";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 16_384;

function response(status: number, requestId?: string) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store", ...(requestId ? { "X-Request-ID": requestId } : {}) },
  });
}

async function smallBody(request: Request): Promise<unknown> {
  if (
    Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES ||
    !request.body
  )
    throw new Error("invalid_body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("invalid_body");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
  if (!billingHasCredentials()) return response(503);
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
  if (
    !body.data ||
    typeof body.data !== "object" ||
    Array.isArray(body.data) ||
    String(body.data.id) !== id ||
    body.type !== "payment"
  )
    return response(400);
  const queryTypes = url.searchParams.getAll("type");
  if (
    queryTypes.length > 1 ||
    (queryTypes.length === 1 && queryTypes[0] !== "payment")
  )
    return response(400);
  try {
    // The signed event is only a notification: GET the current payment at Mercado Pago.
    await processMercadoPagoNotification(id);
    return response(200);
  } catch {
    // Retryable response; never log webhook body, payer data or secret-bearing URLs.
    return response(503, operationalFailure("billing.webhook_failed"));
  }
}
