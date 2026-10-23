const customerTabs = new Set(["inicio", "agendamentos", "favoritos", "avaliacoes", "perfil", "configuracoes"]);
const businessTabs = new Set(["dashboard", "agenda", "servicos", "clientes", "avaliacoes", "perfil", "galeria", "configuracoes", "plano"]);

// Navigation state never grants permissions. Authentication only accepts these
// known local destinations, including validated booking selections.
export function safeAuthDestination(value: unknown, fallback = "/cliente") {
  if (typeof value !== "string" || value.length > 500 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  const url = new URL(value, "https://navigation.invalid");
  if (url.origin !== "https://navigation.invalid" || url.hash) return fallback;
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => url.searchParams.getAll(key).length !== 1)) return fallback;
  if (url.pathname === "/cliente" || url.pathname === "/empresa") {
    if (!keys.length) return url.pathname;
    const tabs = url.pathname === "/cliente" ? customerTabs : businessTabs;
    const tab = url.searchParams.get("tab");
    return keys.length === 1 && tab && tabs.has(tab) ? `${url.pathname}?tab=${tab}` : fallback;
  }
  if (url.pathname === "/planos" || url.pathname === "/recuperar") return keys.length ? fallback : url.pathname;
  const match = /^\/agendar\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(url.pathname);
  if (!match || match[1].length > 64 || keys.some((key) => key !== "service" && key !== "date")) return fallback;
  const service = url.searchParams.get("service"), date = url.searchParams.get("date");
  if (url.searchParams.has("service") && (!service || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service))) return fallback;
  if (url.searchParams.has("date") && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) return fallback;
  return `${url.pathname}${url.search}`;
}

// Preserve Supabase RedirectTo in token-hash emails without trusting it as an
// open redirect or requiring the original device's PKCE cookie.
export function safeEmailRedirectDestination(value: unknown, siteUrl: string | undefined) {
  if (typeof value !== "string" || value.length > 1000 || !siteUrl) return "";
  try {
    const site = new URL(siteUrl), redirect = new URL(value);
    if (site.protocol !== "https:" || redirect.origin !== site.origin || redirect.pathname !== "/auth/callback" || redirect.hash || redirect.username || redirect.password) return "";
    if ([...redirect.searchParams.keys()].some((key) => key !== "next") || redirect.searchParams.getAll("next").length !== 1) return "";
    return safeAuthDestination(redirect.searchParams.get("next"), "");
  } catch { return ""; }
}
