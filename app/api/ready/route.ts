import { createClient } from "@supabase/supabase-js";
import { withRequestTimeout } from "@/lib/server-fetch";
import { operationalFailure } from "@/lib/operations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ status: "unavailable" }, { status: 503, headers });
  try {
    // Anonymous, read-only, bounded probe. No session refresh, admin key or user data.
    const db = createClient(url, key, { db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: withRequestTimeout(3_000) } });
    const { error } = await db.from("business_catalog").select("id").limit(1).abortSignal(AbortSignal.timeout(3_000));
    if (error) throw new Error("dependency_unavailable");
    return Response.json({ status: "ready" }, { headers });
  } catch {
    const requestId = operationalFailure("health.dependency_failed");
    return Response.json({ status: "unavailable" }, { status: 503, headers: { ...headers, "X-Request-ID": requestId } });
  }
}
