import type { Metadata } from "next";
export const metadata: Metadata = { title: "Reagendar" };
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { changeAppointment } from "@/lib/actions";
import { dateTime, localDate } from "@/lib/types";
import { AppShell } from "@/components/app-shell";
import { SlotPicker, Slot } from "@/components/slot-picker";
import { FormSubmit } from "@/components/form-submit";

export default async function Reschedule({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; from?: string }>;
}) {
  if (!isConfigured()) redirect("/entrar");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/entrar");
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: a } = await db
    .from("appointments")
    .select("business_id,service_id,service_name,customer_id,starts_at,status")
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();
  const [{ data: b }, owner] = await Promise.all([
    db
      .from("business_catalog")
      .select("name,timezone")
      .eq("id", a.business_id)
      .single(),
    query.from === "empresa" || a.customer_id !== user.id
      ? db
          .from("businesses")
          .select("id")
          .eq("id", a.business_id)
          .eq("owner_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!b || (a.customer_id !== user.id && !owner.data)) notFound();
  // The requested navigation context cannot turn a customer into the host.
  const host = Boolean(owner.data);
  const workspace = host ? "empresa" : "cliente";
  const back = host ? "/empresa?tab=agenda" : "/cliente?tab=agendamentos";
  const today = localDate(b.timezone);
  const date = z.iso.date().safeParse(query.date).success ? query.date! : today;
  const max = new Date(`${today}T12:00:00Z`);
  max.setUTCDate(max.getUTCDate() + 90);
  const { data: slots, error } = await db.rpc("available_slots", {
    p_business_id: a.business_id,
    p_service_id: a.service_id,
    p_date: date,
  });
  return (
    <AppShell
      active={workspace}
      workspace={workspace}
      activeTab={host ? "agenda" : "agendamentos"}
    >
      <div className="page-intro">
        <span className="eyebrow">Um novo horário</span>
        <h1>Reagendar {a.service_name}</h1>
        <p className="muted">
          Atual: {dateTime(a.starts_at, b.timezone)} · {b.name}
        </p>
      </div>
      {!["pending", "confirmed"].includes(a.status) ? (
        <p className="notice">Este agendamento não permite reagendamento.</p>
      ) : (
        <div className="grid-2">
          <form className="card stack" method="get">
            <input type="hidden" name="from" value={workspace} />
            <label className="field">
              Nova data
              <input
                name="date"
                type="date"
                min={today}
                max={max.toISOString().slice(0, 10)}
                defaultValue={date}
                required
              />
            </label>
            <button className="button button-secondary">
              Consultar horários
            </button>
          </form>
          <form className="card stack" action={changeAppointment}>
            <input name="appointment_id" type="hidden" value={id} />
            <input name="action" type="hidden" value="reschedule" />
            <input name="return_to" type="hidden" value={back} />
            {error ? (
              <p className="notice error">
                Não foi possível consultar a disponibilidade. O serviço pode
                estar inativo.
              </p>
            ) : (
              <SlotPicker
                slots={(slots || []) as Slot[]}
                timezone={b.timezone}
              />
            )}
            <p className="muted">
              O valor original será preservado. A duração seguirá a configuração
              atual do serviço. Ao trocar o horário, a reserva volta a aguardar
              confirmação.
            </p>
            <FormSubmit disabled={Boolean(error) || !slots?.length}>
              Salvar novo horário
            </FormSubmit>
          </form>
        </div>
      )}
      <Link href={back} prefetch={false}>
        Voltar para minha agenda
      </Link>
    </AppShell>
  );
}
