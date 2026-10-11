import Link from "next/link";
import { Logo } from "@/components/ui";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { bookAppointment } from "@/lib/actions";
import { Service, localDate, money } from "@/lib/types";
import { Notices } from "@/components/notices";
import { SlotPicker, Slot } from "@/components/slot-picker";

export default async function Booking({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    service?: string;
    date?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  if (!isConfigured())
    return (
      <main id="main" className="container workspace stack">
        <Link href="/" aria-label="MyMeet, início">
          <Logo />
        </Link>
        <h1>A agenda está sendo preparada.</h1>
        <p className="notice">O acesso real aguarda a conexão com Supabase.</p>
        <Link className="button" href="/demo">
          Ver demonstração
        </Link>
      </main>
    );
  const db = await supabase();
  const { data: business, error: businessError } = await db
    .from("business_catalog")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (businessError)
    return (
      <main id="main" className="container workspace">
        <h1>Agenda indisponível</h1>
        <p className="notice error">
          Não foi possível carregar esta agenda. Tente novamente mais tarde.
        </p>
      </main>
    );
  if (!business) notFound();
  const [
    { data: services, error: serviceError },
    {
      data: { user },
    },
  ] = await Promise.all([
    db
      .from("services")
      .select("*")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("name"),
    db.auth.getUser(),
  ]);
  const options = (services || []) as Service[];
  const selected = options.find((s) => s.id === query.service) || options[0];
  const today = localDate(business.timezone);
  const date = z.iso.date().safeParse(query.date).success ? query.date! : today;
  const lastDate = new Date(`${today}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + 90);
  const slotResult = selected
    ? await db.rpc("available_slots", {
        p_business_id: business.id,
        p_service_id: selected.id,
        p_date: date,
      })
    : { data: [], error: null };
  const slots = (slotResult.data || []) as Slot[];
  return (
    <main id="main" className="container workspace stack">
      <nav className="inline between">
        <Link href="/" aria-label="MyMeet, início">
          <Logo />
        </Link>
        <Link href={user ? "/cliente" : `/entrar?next=/agendar/${slug}`}>
          {user ? "Meus agendamentos" : "Entrar"}
        </Link>
      </nav>
      <div className="page-intro">
        <span className="eyebrow">Reserve um tempo para você</span>
        <h1>{business.name}</h1>
        <p className="muted">{business.description}</p>
        <p className="chip">Horários de Brasília</p>
      </div>
      <Notices params={query} />
      {(serviceError || slotResult.error) && (
        <p className="notice error" role="alert">
          Não foi possível carregar a disponibilidade. Confira a data ou tente
          novamente.
        </p>
      )}
      <div className="grid-2">
        <section className="card stack">
          <h2>1. Seu serviço e seu dia</h2>
          {!options.length ? (
            <p className="muted">
              Esta empresa ainda não disponibilizou serviços.
            </p>
          ) : (
            <form className="stack" method="get">
              <label className="field">
                Serviço
                <select name="service" defaultValue={selected?.id}>
                  {options.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name} · {s.duration_minutes} min ·{" "}
                      {money(s.price_cents)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Data
                <input
                  type="date"
                  name="date"
                  min={today}
                  max={lastDate.toISOString().slice(0, 10)}
                  defaultValue={date}
                  required
                />
              </label>
              <button className="button button-secondary">
                Consultar horários
              </button>
            </form>
          )}
          {selected && <p className="muted">{selected.description}</p>}
        </section>
        <section className="card stack">
          <h2>2. Escolha seu horário</h2>
          {selected && (
            <form className="stack" action={bookAppointment}>
              <input type="hidden" name="business_id" value={business.id} />
              <input type="hidden" name="service_id" value={selected.id} />
              <input type="hidden" name="next" value={`/agendar/${slug}`} />
              <SlotPicker slots={slots} timezone={business.timezone} />
              <p className="muted">
                {selected.name} · {selected.duration_minutes} minutos ·{" "}
                {money(selected.price_cents)}
              </p>
              {user ? (
                <>
                  <small>
                    Ao agendar, a empresa recebe seu nome e os dados da reserva.
                    Seu e-mail permanece privado.{" "}
                    <Link href="/privacidade">Saiba mais</Link>.
                  </small>
                  <button className="button" disabled={!slots.length}>
                    Confirmar agendamento
                  </button>
                </>
              ) : (
                <Link className="button" href={`/entrar?next=/agendar/${slug}`}>
                  Entrar para agendar
                </Link>
              )}
            </form>
          )}
        </section>
      </div>
      <Link href="/privacidade">Privacidade e seus dados</Link>
    </main>
  );
}
