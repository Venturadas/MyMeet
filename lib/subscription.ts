import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasBusinessSubscription(db: SupabaseClient) {
  const { data, error } = await db.rpc("has_active_business_subscription");
  return !error && data === true;
}
