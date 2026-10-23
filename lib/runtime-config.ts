export type EnvironmentIssue = { key: string; code: string };
type Environment = Record<string, string | undefined>;

export function inspectEnvironment(env: Environment, production = true) {
  const errors: EnvironmentIssue[] = [];
  const warnings: EnvironmentIssue[] = [];
  const issue = (key: string, code: string) => errors.push({ key, code });
  const required = (key: string) => {
    if (!env[key]?.trim()) issue(key, "missing");
    else if (/SEU[-_ ]|SUA[-_ ]|YOUR[-_ ]|example\.(com|invalid)/i.test(env[key]!)) issue(key, "placeholder");
  };
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SITE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) required(key);
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
    if (!env[key]) continue;
    try {
      const url = new URL(env[key]!);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if ((url.protocol !== "https:" && !(local && !production && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) issue(key, "invalid_origin");
    } catch { issue(key, "invalid_origin"); }
  }
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (publicKey) {
    if (publicKey.startsWith("sb_secret_")) issue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "privileged_key");
    try {
      const payload = JSON.parse(Buffer.from(publicKey.split(".")[1] || "", "base64url").toString("utf8"));
      if (payload.role === "service_role") issue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "privileged_key");
    } catch { /* New publishable keys are opaque; not all public keys are JWTs. */ }
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.trim().length < 32) issue("SUPABASE_SERVICE_ROLE_KEY", "invalid_recovery_key");
  for (const key of ["NUVEMMEET_REGISTRATION_OPEN", "MERCADO_PAGO_BILLING_ENABLED"]) {
    if (env[key] && !["true", "false"].includes(env[key]!)) issue(key, "invalid_boolean");
  }
  if (env.NUVEMMEET_REGISTRATION_OPEN === "true") {
    required("NEXT_PUBLIC_CONTROLLER_NAME"); required("NEXT_PUBLIC_PRIVACY_CONTACT");
    if (env.NEXT_PUBLIC_PRIVACY_CONTACT && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.NEXT_PUBLIC_PRIVACY_CONTACT)) issue("NEXT_PUBLIC_PRIVACY_CONTACT", "invalid_email");
  }
  if (env.MERCADO_PAGO_BILLING_ENABLED === "true") {
    required("MERCADO_PAGO_ACCESS_TOKEN"); required("MERCADO_PAGO_WEBHOOK_SECRET");
    if (production && env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith("TEST-")) issue("MERCADO_PAGO_ACCESS_TOKEN", "test_credential_in_production");
    warnings.push({ key: "MERCADO_PAGO_BILLING_ENABLED", code: "owner_payment_validation_required" });
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_") && /SECRET|PASSWORD|SERVICE_ROLE|ACCESS_TOKEN|WEBHOOK/.test(key)) issue(key, "public_secret_binding");
  }
  return { valid: errors.length === 0, errors, warnings };
}
