import { createHmac, timingSafeEqual } from "node:crypto";

export const RECOVERY_GRANT_SECONDS = 15 * 60;
type SessionIdentity = { userId: string; sessionId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const domain = "NuvemMeet/password-recovery/v1";

export function recoveryKeyIsConfigured(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.trim().length >= 32;
}

function signature(payload: string, secret: string) {
  const key = createHmac("sha256", secret).update(domain).digest();
  return createHmac("sha256", key).update(payload).digest();
}

// This only extracts the session binding. The caller must first validate the
// access token through getUser(), or receive it directly from verifyOtp().
export function sessionIdentityFromVerifiedAccessToken(accessToken: string | undefined, userId: string): SessionIdentity | null {
  if (!uuid.test(userId) || !accessToken || accessToken.length > 16384) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims && claims.sub === userId && typeof claims.session_id === "string" && uuid.test(claims.session_id)
      ? { userId, sessionId: claims.session_id }
      : null;
  } catch { return null; }
}

export function createRecoveryProof(identity: SessionIdentity, secret: string | undefined, now = Date.now()): string | null {
  if (!recoveryKeyIsConfigured(secret) || !uuid.test(identity.userId) || !uuid.test(identity.sessionId) || !Number.isFinite(now)) return null;
  const payload = Buffer.from(JSON.stringify({ v: 1, uid: identity.userId, sid: identity.sessionId, exp: Math.floor(now / 1000) + RECOVERY_GRANT_SECONDS })).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyRecoveryProof(value: string | undefined, identity: SessionIdentity, secret: string | undefined, now = Date.now()): boolean {
  if (!recoveryKeyIsConfigured(secret) || !value || value.length > 512 || !Number.isFinite(now)) return false;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
  const actual = Buffer.from(parts[1], "base64url"), expected = signature(parts[0], secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const proof = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")), seconds = Math.floor(now / 1000);
    return proof?.v === 1 && proof.uid === identity.userId && proof.sid === identity.sessionId && Number.isInteger(proof.exp) && proof.exp > seconds && proof.exp <= seconds + RECOVERY_GRANT_SECONDS;
  } catch { return false; }
}
