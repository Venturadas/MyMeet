import Link from "next/link";
import { changeAppointment } from "@/lib/actions";
import { safeAuthDestination } from "@/lib/auth-navigation";
import { Appointment, dateTime, money } from "@/lib/types";
import { FormSubmit } from "@/components/form-submit";
import { MediaImage } from "@/components/media-image";
import { EmptyState, StatusBadge } from "@/components/ui";
import { CalendarDays, Clock3, MoreHorizontal } from "lucide-react";

export type AppointmentBusiness = {
  name: string;
  logo_path: string | null;
};
function Action({
  appointment,
  action,
  label,
  returnTo,
}: {
  appointment: Appointment;
  action: string;
  label: string;
  returnTo: string;
}) {
  return (
    <form action={changeAppointment}>
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="return_to" value={returnTo} />
      <FormSubmit secondary pendingLabel="Atualizando…">
        {label}
      </FormSubmit>
    </form>
  );
}
export function Appointments({
  items,
  host = false,
  allowReschedule = true,
  timezone = "America/Sao_Paulo",
  returnTo,
  businesses = {},
}: {
  items: Appointment[];
  host?: boolean;
  allowReschedule?: boolean;
  timezone?: string;
  returnTo?: string;
  businesses?: Record<string, AppointmentBusiness>;
}) {
  const actionDestination = safeAuthDestination(
    returnTo,
    host ? "/empresa?tab=agenda" : "/cliente?tab=agendamentos",
  );
  if (!items.length)
    return (
      <EmptyState
        title="Sua agenda começa no próximo encontro."
        description="Os agendamentos aparecerão aqui assim que forem feitos."
      />
    );
  return (
    <div className="appointment-list">
      {items.map((a) => {
        const business = businesses[a.business_id];
        const title = host ? a.customer_name : business?.name || a.service_name;
        return (
          <article className="appointment-row" key={a.id}>
            <MediaImage
              path={host ? undefined : business?.logo_path}
              alt={
                host
                  ? `Cliente ${a.customer_name}`
                  : `Logo de ${business?.name || "empresa"}`
              }
              fallback={title}
              width={48}
              height={48}
              className="appointment-avatar"
            />
            <div className="appointment-identity">
              <h3>{title}</h3>
              <p className="muted">
                {host || business ? a.service_name : "Atendimento agendado"}
              </p>
              <small className="appointment-price muted">
                {money(a.price_cents)}
              </small>
            </div>
            <div
              className="appointment-schedule"
              aria-label={dateTime(a.starts_at, timezone)}
            >
              <span>
                <CalendarDays size={15} aria-hidden="true" />
                {new Intl.DateTimeFormat("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  timeZone: timezone,
                }).format(new Date(a.starts_at))}
              </span>
              <span>
                <Clock3 size={15} aria-hidden="true" />
                {new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: timezone,
                }).format(new Date(a.starts_at))}
              </span>
            </div>
            <StatusBadge status={a.status} />
            <details className="appointment-options">
              <summary
                aria-label={`Opções de ${a.service_name}`}
                title="Opções do agendamento"
              >
                <MoreHorizontal size={20} aria-hidden="true" />
              </summary>
              <div className="appointment-options-panel stack">
                <p className="muted">
                  {a.service_name} · {money(a.price_cents)}
                </p>
                <div className="appointment-actions stack">
                  {host && a.status === "pending" && (
                    <Action
                      appointment={a}
                      action="confirm"
                      label="Confirmar"
                      returnTo={actionDestination}
                    />
                  )}
                  {host &&
                    a.status === "confirmed" &&
                    new Date(a.ends_at) <= new Date() && (
                      <Action
                        appointment={a}
                        action="complete"
                        label="Marcar concluído"
                        returnTo={actionDestination}
                      />
                    )}
                  {["pending", "confirmed"].includes(a.status) &&
                    (host || new Date(a.starts_at) > new Date()) && (
                      <>
                        {allowReschedule && <Link
                          className="button button-secondary"
                          href={`/reagendar/${a.id}${host ? "?from=empresa" : ""}`}
                          prefetch={false}
                        >
                          Reagendar
                        </Link>}
                        <Action
                          appointment={a}
                          action="cancel"
                          label="Cancelar"
                          returnTo={actionDestination}
                        />
                      </>
                    )}
                </div>
                {host && (
                  <form className="stack" action={changeAppointment}>
                    <input type="hidden" name="appointment_id" value={a.id} />
                    <input type="hidden" name="action" value="comment" />
                    <input
                      type="hidden"
                      name="return_to"
                      value={actionDestination}
                    />
                    <label className="field">
                      Mensagem visível ao cliente
                      <textarea
                        name="comment"
                        maxLength={500}
                        defaultValue={a.comment || ""}
                      />
                      <small>
                        Evite dados sensíveis ou informações desnecessárias ao
                        atendimento.
                      </small>
                    </label>
                    <FormSubmit secondary>Salvar comentário</FormSubmit>
                  </form>
                )}
              </div>
            </details>
            {a.comment && (
              <p className="appointment-comment">
                Comentário da empresa: {a.comment}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
