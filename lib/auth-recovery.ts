import "server-only";
import { cookies } from "next/headers";
import type { supabase } from "@/lib/supabase";
import { createRecoveryProof, RECOVERY_GRANT_SECONDS, recoveryKeyIsConfigured, sessionIdentityFromVerifiedAccessToken, verifyRecoveryProof } from "@/lib/auth-recovery-proof";

const cookieName = "nuvemmeet-recovery";
export function recoveryGrantIsConfigured() {
  return recoveryKeyIsConfigured(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function grantVerifiedRecovery(session: { access_token: string; user: { id: string } }) {
  const identity = sessionIdentityFromVerifiedAccessToken(session.access_token, session.user.id);
  const proof = identity && createRecoveryProof(identity, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!proof) throw new Error("Não foi possível autorizar a recuperação.");
  (await cookies()).set(cookieName, proof, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: RECOVERY_GRANT_SECONDS,
  });
}

// Must be called only after getUser() has authenticated this same client.
export async function hasRecoveryGrantForAuthenticatedUser(db: Awaited<ReturnType<typeof supabase>>, userId: string) {
  if (!recoveryGrantIsConfigured()) return false;
  try {
    const { data, error } = await db.auth.getSession();
    if (error) return false;
    const identity = sessionIdentityFromVerifiedAccessToken(data.session?.access_token, userId);
    return Boolean(identity && verifyRecoveryProof((await cookies()).get(cookieName)?.value, identity, process.env.SUPABASE_SERVICE_ROLE_KEY));
  } catch { return false; }
}

export async function clearRecoveryGrant() {
  (await cookies()).delete(cookieName);
}
