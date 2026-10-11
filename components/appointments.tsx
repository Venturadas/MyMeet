import Link from "next/link";
import { changeAppointment } from "@/lib/actions";
import { Appointment, dateTime, money } from "@/lib/types";

const statusNames = {
  pending: "Aguardando confirmação",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};
function Action({
  appointment,
  action,
  label,
  host,
}: {
  appointment: Appointment;
  action: string;
  label: string;
  host: boolean;
}) {
  return (
    <form action={changeAppointment}>
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <input type="hidden" name="action" value={action} />
      <input
        type="hidden"
        name="return_to"
        value={host ? "/empresa" : "/cliente"}
      />
      <button className="button button-secondary">{label}</button>
    </form>
  );
}
export function Appointments({
  items,
  host = false,
  timezone = "America/Sao_Paulo",
}: {
  items: Appointment[];
  host?: boolean;
  timezone?: string;
}) {
  if (!items.length)
    return (
      <div className="card empty-state">
        <h3>Sua agenda começa no próximo encontro.</h3>
        <p className="muted">
          Os agendamentos aparecerão aqui assim que forem feitos.
        </p>
      </div>
    );
  return (
    <div className="stack">
      {items.map((a) => (
        <article className="card appointment-card stack" key={a.id}>
          <div className="inline between">
            <div>
              <span className="eyebrow">{dateTime(a.starts_at, timezone)}</span>
              <h3>{a.service_name}</h3>
              <p className="muted">
                {host ? `Cliente: ${a.customer_name} · ` : ""}
                {money(a.price_cents)}
              </p>
            </div>
            <span className={`status status-${a.status}`}>
              {statusNames[a.status]}
            </span>
          </div>
          {a.comment && (
            <p className="notice">Comentário da empresa: {a.comment}</p>
          )}
          <div className="inline">
            {host && a.status === "pending" && (
              <Action
                appointment={a}
                action="confirm"
                label="Confirmar"
                host={host}
              />
            )}{" "}
            {host &&
              a.status === "confirmed" &&
              new Date(a.ends_at) <= new Date() && (
                <Action
                  appointment={a}
                  action="complete"
                  label="Marcar concluído"
                  host={host}
                />
              )}{" "}
            {["pending", "confirmed"].includes(a.status) && (
              <>
                <Link
                  className="button button-secondary"
                  href={`/reagendar/${a.id}${host ? "?from=empresa" : ""}`}
                >
                  Reagendar
                </Link>
                <Action
                  appointment={a}
                  action="cancel"
                  label="Cancelar"
                  host={host}
                />
              </>
            )}
          </div>
          {host && (
            <details>
              <summary>Comentário sobre o agendamento</summary>
              <form className="stack" action={changeAppointment}>
                <input type="hidden" name="appointment_id" value={a.id} />
                <input type="hidden" name="action" value="comment" />
                <input type="hidden" name="return_to" value="/empresa" />
                <label className="field">
                  Mensagem visível ao cliente
                  <textarea
                    name="comment"
                    maxLength={500}
                    defaultValue={a.comment || ""}
                  />
                  <small>
                    Evite dados sensíveis ou informações que não sejam
                    necessárias ao atendimento.
                  </small>
                </label>
                <button className="button button-secondary">
                  Salvar comentário
                </button>
              </form>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}
