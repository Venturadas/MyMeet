import { randomUUID } from "node:crypto";

type Event = "billing.checkout_failed" | "billing.status_failed" | "billing.webhook_failed" | "media.request_failed" | "privacy.export_failed" | "health.dependency_failed";
const reasons = new Set(["provider_unavailable", "invalid_merchant", "invalid_payment", "billing_storage_unavailable", "checkout_unavailable", "checkout_expired", "invalid_checkout"]);

/** Never accept payloads, identities, URLs or raw provider errors in operational logs. */
export function operationalFailure(event: Event, error?: unknown) {
  const requestId = randomUUID();
  const reason = error instanceof Error && reasons.has(error.message) ? error.message : "unavailable";
  console.warn(JSON.stringify({ event, reason, requestId, at: new Date().toISOString() }));
  return requestId;
}
