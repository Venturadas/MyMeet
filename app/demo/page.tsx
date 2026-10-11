"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, Logo, StatusBadge } from "@/components/ui";

type Appointment = {
  id: number;
  service: string;
  day: string;
  time: string;
  price: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  comment: string;
};
const services = [
  { name: "Consultoria inicial", duration: "45 minutos", price: 120 },
  { name: "Sessão de acompanhamento", duration: "60 minutos", price: 180 },
];
const days = ["14 de outubro", "15 de outubro", "16 de outubro"];
const hours = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
const initial: Appointment[] = [
  {
    id: 1,
    service: services[0].name,
    day: days[0],
    time: "09:00",
    price: 120,
    status: "confirmed",
    comment: "",
  },
  {
    id: 2,
    service: services[1].name,
    day: days[0],
    time: "11:00",
    price: 180,
    status: "pending",
    comment: "",
  },
  {
    id: 3,
    service: services[0].name,
    day: "13 de outubro",
    time: "14:00",
    price: 120,
    status: "completed",
    comment: "Atendimento concluído neste exemplo.",
  },
];
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );

export default function Demo() {
  const [role, setRole] = useState<"customer" | "host">("customer");
  const [appointments, setAppointments] = useState(initial);
  const [serviceIndex, setServiceIndex] = useState(0);
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<"time" | "comment">("time");
  const [editDay, setEditDay] = useState(days[0]);
  const [editTime, setEditTime] = useState("");
  const [comment, setComment] = useState("");
  const active = appointments.filter(
    (item) => item.status === "pending" || item.status === "confirmed",
  );
  const spent = appointments
    .filter((item) => item.status === "completed")
    .reduce((sum, item) => sum + item.price, 0);
  const available = (selectedDay: string, excludedId?: number) =>
    hours.filter(
      (hour) =>
        !appointments.some(
          (item) =>
            item.id !== excludedId &&
            item.day === selectedDay &&
            item.time === hour &&
            item.status !== "cancelled",
        ),
    );
  const updateStatus = (id: number, status: Appointment["status"]) => {
    setAppointments((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setEditing(null);
    setMessage(
      status === "confirmed"
        ? "Agendamento confirmado na demonstração."
        : status === "completed"
          ? "Atendimento marcado como concluído. O total gasto foi atualizado."
          : "Agendamento cancelado. O horário está disponível novamente.",
    );
  };
  const beginEdit = (item: Appointment, mode: "time" | "comment") => {
    setEditing(item.id);
    setEditMode(mode);
    setEditDay(days.includes(item.day) ? item.day : days[0]);
    setEditTime(item.time);
    setComment(item.comment);
    setMessage("");
  };
  const saveEdit = (id: number) => {
    if (editMode === "time" && !available(editDay, id).includes(editTime)) {
      setMessage("Escolha um horário disponível para reagendar.");
      return;
    }
    setAppointments((items) =>
      items.map((item) =>
        item.id !== id
          ? item
          : editMode === "time"
            ? { ...item, day: editDay, time: editTime, status: "pending" }
            : { ...item, comment: comment.trim() },
      ),
    );
    setEditing(null);
    setMessage(
      editMode === "time"
        ? "Horário alterado. O agendamento aguarda confirmação novamente."
        : "Comentário salvo apenas nesta demonstração.",
    );
  };
  const book = () => {
    if (!time || !available(day).includes(time)) {
      setMessage("Selecione um horário disponível.");
      return;
    }
    const service = services[serviceIndex];
    setAppointments((items) => [
      {
        id: Date.now(),
        service: service.name,
        day,
        time,
        price: service.price,
        status: "pending",
        comment: "",
      },
      ...items,
    ]);
    setTime("");
    setMessage(
      "Pronto! Seu agendamento de exemplo está aguardando confirmação. Experimente confirmá-lo no painel da empresa.",
    );
  };

  return (
    <>
      <div className="demo-banner">
        <span className="tiny-dot" aria-hidden="true" /> Demonstração · dados
        fictícios, nada é enviado
      </div>
      <header className="app-header container">
        <Link href="/" aria-label="MyMeet, início">
          <Logo />
        </Link>
        <nav className="nav" aria-label="Navegação">
          <Link className="button button-secondary button-small" href="/entrar">
            Usar o MyMeet <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </header>
      <main id="main" className="container dashboard-main">
        <div className="page-intro demo-intro">
          <div>
            <p className="eyebrow">EXPERIMENTE O ESSENCIAL</p>
            <h1>Uma agenda. Dois pontos de vista.</h1>
            <p className="muted">
              Explore como seu cliente agenda e como sua empresa organiza.
            </p>
          </div>
          <div
            className="segmented-control"
            role="group"
            aria-label="Escolher painel"
          >
            <button
              aria-pressed={role === "customer"}
              className={role === "customer" ? "active" : ""}
              onClick={() => {
                setRole("customer");
                setEditing(null);
              }}
            >
              Sou cliente
            </button>
            <button
              aria-pressed={role === "host"}
              className={role === "host" ? "active" : ""}
              onClick={() => {
                setRole("host");
                setEditing(null);
              }}
            >
              Sou empresa
            </button>
          </div>
        </div>
        <div className="notice demo-notice">
          <strong>Este é um espaço para explorar.</strong> Não informe dados
          pessoais. As alterações somem ao atualizar a página.
        </div>
        <div className="grid-3 demo-metrics">
          <div className="metric">
            <span>
              {role === "host" ? "Na sua agenda" : "Próximos encontros"}
            </span>
            <strong>{active.length.toString().padStart(2, "0")}</strong>
            <small>Agendamentos ativos</small>
          </div>
          <div className="metric">
            <span>A confirmar</span>
            <strong>
              {appointments
                .filter((item) => item.status === "pending")
                .length.toString()
                .padStart(2, "0")}
            </strong>
            <small>Aguardando a empresa</small>
          </div>
          <div className="metric">
            <span>
              {role === "host" ? "Atendimentos concluídos" : "Quanto já gastei"}
            </span>
            <strong>
              {role === "host"
                ? appointments
                    .filter((item) => item.status === "completed")
                    .length.toString()
                    .padStart(2, "0")
                : money(spent)}
            </strong>
            <small>
              {role === "host"
                ? "Neste exemplo"
                : "Somente serviços concluídos"}
            </small>
          </div>
        </div>
        <p
          className={`demo-feedback ${message ? "notice" : ""}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
        <div className={role === "customer" ? "demo-content" : ""}>
          {role === "customer" && (
            <section className="card booking-demo" aria-labelledby="book-title">
              <p className="eyebrow">ESCOLHA SEU PRÓXIMO ENCONTRO</p>
              <h2 id="book-title">Agendar é simples.</h2>
              <p className="muted">Estúdio exemplo · serviços fictícios</p>
              <fieldset className="service-picker">
                <legend>1. Escolha o serviço</legend>
                {services.map((service, index) => (
                  <label
                    className={`service-option ${serviceIndex === index ? "selected" : ""}`}
                    key={service.name}
                  >
                    <input
                      type="radio"
                      name="service"
                      checked={serviceIndex === index}
                      onChange={() => setServiceIndex(index)}
                    />
                    <span>
                      <strong>{service.name}</strong>
                      <small>{service.duration}</small>
                    </span>
                    <strong>{money(service.price)}</strong>
                  </label>
                ))}
              </fieldset>
              <fieldset className="date-picker">
                <legend>2. Escolha o dia</legend>
                <div className="date-options">
                  {days.map((date) => (
                    <button
                      key={date}
                      type="button"
                      className={day === date ? "selected" : ""}
                      aria-pressed={day === date}
                      onClick={() => {
                        setDay(date);
                        setTime("");
                      }}
                    >
                      <strong>{date.split(" ")[0]}</strong>
                      <small>Outubro</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="hours-picker">
                <legend>3. Um horário que funciona para você</legend>
                <div className="hour-options">
                  {hours.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      disabled={!available(day).includes(hour)}
                      aria-pressed={time === hour}
                      className={time === hour ? "selected" : ""}
                      onClick={() => setTime(hour)}
                    >
                      {hour}
                      <span className="sr-only">
                        {available(day).includes(hour)
                          ? " disponível"
                          : " indisponível"}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <button
                className="button full-width"
                onClick={book}
                disabled={!time}
              >
                Agendar {time ? `às ${time}` : "horário"}{" "}
                <span aria-hidden="true">→</span>
              </button>
              <p className="booking-hint">
                Nenhuma cobrança é feita nesta demonstração.
              </p>
            </section>
          )}
          <section
            className="appointments-section"
            aria-labelledby="appointments-title"
          >
            <div className="section-heading inline spread">
              <div>
                <p className="eyebrow">
                  {role === "host" ? "ESTÚDIO EXEMPLO" : "SEU TEMPO ORGANIZADO"}
                </p>
                <h2 id="appointments-title">
                  {role === "host" ? "Agenda da empresa" : "Meus agendamentos"}
                </h2>
              </div>
              <span className="chip">{appointments.length} no exemplo</span>
            </div>
            <div className="stack">
              {appointments.length === 0 ? (
                <EmptyState
                  title="Sua agenda começa aqui"
                  description="Escolha um serviço e um horário para experimentar."
                />
              ) : (
                [...appointments]
                  .sort(
                    (a, b) =>
                      a.day.localeCompare(b.day) ||
                      a.time.localeCompare(b.time),
                  )
                  .map((item) => (
                    <article className="appointment-card" key={item.id}>
                      <div className="appointment-top">
                        <span className="appointment-date">
                          {item.day} <span>· {item.time}</span>
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      <h3>{item.service}</h3>
                      <p className="muted appointment-detail">
                        {role === "host"
                          ? "Cliente exemplo · "
                          : "Estúdio exemplo · "}
                        {money(item.price)}
                      </p>
                      {item.comment && (
                        <p className="appointment-comment">
                          <strong>Comentário da empresa</strong>
                          {item.comment}
                        </p>
                      )}
                      {item.status !== "cancelled" &&
                        item.status !== "completed" && (
                          <div className="appointment-actions">
                            {role === "host" && item.status === "pending" && (
                              <button
                                className="button button-small"
                                onClick={() =>
                                  updateStatus(item.id, "confirmed")
                                }
                              >
                                Confirmar
                              </button>
                            )}
                            {role === "host" && item.status === "confirmed" && (
                              <button
                                className="button button-small"
                                onClick={() =>
                                  updateStatus(item.id, "completed")
                                }
                              >
                                Concluir serviço
                              </button>
                            )}
                            <button
                              className="button button-secondary button-small"
                              onClick={() => beginEdit(item, "time")}
                            >
                              Reagendar
                            </button>
                            {role === "host" && (
                              <button
                                className="text-button"
                                onClick={() => beginEdit(item, "comment")}
                              >
                                Comentário
                              </button>
                            )}
                            <button
                              className="text-button danger"
                              onClick={() => updateStatus(item.id, "cancelled")}
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      {editing === item.id && (
                        <div className="appointment-editor">
                          <h4>
                            {editMode === "time"
                              ? "Escolha o novo horário"
                              : "Comentário do agendamento"}
                          </h4>
                          {editMode === "time" ? (
                            <div className="form-grid">
                              <label className="field">
                                Dia
                                <select
                                  aria-label="Dia"
                                  value={editDay}
                                  onChange={(event) => {
                                    setEditDay(event.target.value);
                                    setEditTime("");
                                  }}
                                >
                                  {days.map((date) => (
                                    <option key={date}>{date}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="field">
                                Horário
                                <select
                                  aria-label="Horário"
                                  value={editTime}
                                  onChange={(event) =>
                                    setEditTime(event.target.value)
                                  }
                                >
                                  <option value="">Selecione</option>
                                  {available(editDay, item.id).map((hour) => (
                                    <option key={hour}>{hour}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          ) : (
                            <label className="field">
                              Use apenas informações fictícias
                              <textarea
                                rows={3}
                                maxLength={300}
                                value={comment}
                                onChange={(event) =>
                                  setComment(event.target.value)
                                }
                                placeholder="Ex.: reservar 10 minutos para alinhar o próximo encontro."
                              />
                            </label>
                          )}
                          <div className="inline">
                            <button
                              className="button button-small"
                              disabled={editMode === "time" && !editTime}
                              onClick={() => saveEdit(item.id)}
                            >
                              Salvar alteração
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setEditing(null)}
                            >
                              Voltar
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))
              )}
            </div>
          </section>
        </div>
        <div className="demo-cta card">
          <div>
            <h2>Pronto para organizar a sua agenda?</h2>
            <p className="muted">
              Crie uma conta para usar dados e agendamentos reais.
            </p>
          </div>
          <Link className="button" href="/entrar">
            Começar agora <span aria-hidden="true">→</span>
          </Link>
        </div>
      </main>
      <footer className="site-footer container">
        <Link href="/" aria-label="MyMeet, início">
          <Logo />
        </Link>
        <p>Demonstração com informações fictícias.</p>
        <Link href="/privacidade">Privacidade</Link>
      </footer>
    </>
  );
}
