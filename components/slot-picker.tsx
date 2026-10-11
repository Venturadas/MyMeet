import { dateTime } from "@/lib/types";
export type Slot = { starts_at: string; ends_at: string };
export function SlotPicker({
  slots,
  timezone,
}: {
  slots: Slot[];
  timezone: string;
}) {
  if (!slots.length)
    return (
      <p className="notice">
        Nenhum horário disponível nesta data. Escolha outro dia.
      </p>
    );
  return (
    <fieldset className="slot-fieldset">
      <legend>Escolha um horário</legend>
      <div className="slots">
        {slots.map((s) => (
          <label className="slot" key={s.starts_at}>
            <input type="radio" name="starts_at" value={s.starts_at} required />
            <span>
              {new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: timezone,
              }).format(new Date(s.starts_at))}
            </span>
            <span className="sr-only">{dateTime(s.starts_at, timezone)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
