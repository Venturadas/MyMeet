"use client";

import { useState } from "react";
import type { BusinessAnalyticsReport } from "@/lib/business-analytics";

function reportDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function BusinessAnalytics({
  report,
}: {
  report: BusinessAnalyticsReport;
}) {
  const [selectedDay, setSelectedDay] = useState(report.days.length - 1);
  const [tablePage, setTablePage] = useState(0);
  const days = report.days;
  const selectedIndex = Math.min(selectedDay, days.length - 1);
  const selected = days[selectedIndex];
  const maximum = Math.max(1, ...days.map((day) => day.completed));
  const point = (index: number, completed: number) => ({
    x: 8 + (index / Math.max(1, days.length - 1)) * 584,
    y: 132 - (completed / maximum) * 120,
  });
  const points = days.map((day, index) => point(index, day.completed));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const current = points[selectedIndex];
  const pageSize = 20;
  const pageCount = Math.ceil(days.length / pageSize);
  const currentPage = Math.min(tablePage, pageCount - 1);
  const rows = days
    .slice()
    .reverse()
    .slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <>
      <dl className="metrics-strip">
        <div>
          <dt>Agendamentos</dt>
          <dd className="metric-value">{report.totals.appointments}</dd>
          <small>No período</small>
        </div>
        <div>
          <dt>Concluídos</dt>
          <dd className="metric-value">{report.totals.completed}</dd>
          <small>No período</small>
        </div>
        <div>
          <dt>Futuros</dt>
          <dd className="metric-value">{report.totals.future}</dd>
          <small>Todos os próximos</small>
        </div>
        <div>
          <dt>Cancelados</dt>
          <dd className="metric-value">{report.totals.cancelled}</dd>
          <small>No período</small>
        </div>
      </dl>
      <figure className="report-chart">
        <figcaption id="completed-chart-caption">
          <strong>Atendimentos concluídos por dia</strong>
          <span className="muted">
            Máximo diário:{" "}
            {maximum === 1 && !report.totals.completed ? 0 : maximum}
          </span>
        </figcaption>
        <svg
          viewBox="0 0 600 144"
          role="img"
          aria-labelledby="completed-chart-caption"
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - bounds.left) / bounds.width;
            setSelectedDay(
              Math.max(
                0,
                Math.min(
                  days.length - 1,
                  Math.round(ratio * (days.length - 1)),
                ),
              ),
            );
          }}
        >
          <title>{`${report.totals.completed} atendimentos concluídos entre ${reportDate(report.starts_on, true)} e ${reportDate(report.ends_on, true)}. Os valores de cada dia estão na tabela abaixo.`}</title>
          {[12, 72, 132].map((y) => (
            <line
              key={y}
              x1="8"
              x2="592"
              y1={y}
              y2={y}
              stroke="currentColor"
              opacity="0.12"
            />
          ))}
          <polygon
            points={`8,132 ${line} 592,132`}
            fill="currentColor"
            opacity="0.08"
          />
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={current.x}
            x2={current.x}
            y1="8"
            y2="132"
            stroke="currentColor"
            opacity="0.25"
            strokeDasharray="4 4"
          />
          <circle cx={current.x} cy={current.y} r="4.5" fill="currentColor" />
        </svg>
        <div className="inline between muted">
          <small>{reportDate(report.starts_on)}</small>
          <small>{reportDate(report.ends_on)}</small>
        </div>
        <label className="chart-day-control">
          <span className="sr-only" id="completed-chart-day-label">
            Escolher dia no gráfico de atendimentos concluídos
          </span>
          <input
            type="range"
            aria-labelledby="completed-chart-day-label"
            aria-valuetext={`${reportDate(selected.date, true)}, ${selected.completed} concluídos`}
            min={0}
            max={days.length - 1}
            value={selectedIndex}
            onChange={(event) => setSelectedDay(Number(event.target.value))}
          />
          <output aria-live="polite">
            {reportDate(selected.date, true)} · {selected.completed}{" "}
            {selected.completed === 1 ? "concluído" : "concluídos"}
          </output>
        </label>
      </figure>
      <table className="report-table">
        <caption className="sr-only">
          Agendamentos por dia, de {reportDate(report.starts_on, true)} a{" "}
          {reportDate(report.ends_on, true)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Agendamentos</th>
            <th scope="col">Concluídos</th>
            <th scope="col">Cancelados</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((day) => (
            <tr key={day.date}>
              <th scope="row">{reportDate(day.date, report.range === "1y")}</th>
              <td>{day.appointments}</td>
              <td>{day.completed}</td>
              <td>{day.cancelled}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="report-total">
            <th scope="row">Total</th>
            <td>{report.totals.appointments}</td>
            <td>{report.totals.completed}</td>
            <td>{report.totals.cancelled}</td>
          </tr>
        </tfoot>
      </table>
      {pageCount > 1 && (
        <nav
          className="inline between report-pagination"
          aria-label="Dias do relatório"
        >
          <button
            type="button"
            className="button button-secondary"
            disabled={currentPage === 0}
            onClick={() => setTablePage(currentPage - 1)}
          >
            Anterior
          </button>
          <small aria-live="polite">
            {currentPage + 1} de {pageCount}
          </small>
          <button
            type="button"
            className="button button-secondary"
            disabled={currentPage + 1 === pageCount}
            onClick={() => setTablePage(currentPage + 1)}
          >
            Próxima
          </button>
        </nav>
      )}
      <small className="muted">
        Por data do atendimento, no horário da empresa. Apenas o status
        concluído entra no gráfico.
      </small>
    </>
  );
}
