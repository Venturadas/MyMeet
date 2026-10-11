export type Business = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
};
export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
};
export type Appointment = {
  id: string;
  business_id: string;
  service_id: string;
  service_name: string;
  customer_id: string;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  price_cents: number;
  comment: string | null;
};
export type BusinessHours = {
  business_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};
export function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
export function dateTime(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
export function localDate(timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
