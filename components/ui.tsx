export function Logo() {
  return (
    <span className="brand">
      <svg
        width="34"
        height="34"
        viewBox="0 0 34 34"
        fill="none"
        aria-hidden="true"
      >
        <rect width="34" height="34" rx="12" fill="currentColor" />
        <path
          d="M10 23V14a3 3 0 0 1 6 0v7-7a3 3 0 0 1 6 0v9"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="25" cy="10" r="2" fill="#B5D9FF" />
      </svg>
      <span>
        MyMeet<span className="brand-dot">.</span>
      </span>
    </span>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <svg
        width="42"
        height="42"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="4"
          y="5"
          width="16"
          height="16"
          rx="5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M8 3v4m8-4v4M4 11h16m-9 4h2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
    </div>
  );
}

const statuses: Record<string, { text: string; className: string }> = {
  pending: { text: "A confirmar", className: "pending" },
  confirmed: { text: "Confirmado", className: "confirmed" },
  completed: { text: "Concluído", className: "completed" },
  cancelled: { text: "Cancelado", className: "cancelled" },
};

export function StatusBadge({ status }: { status: string }) {
  const value = statuses[status] ?? { text: status, className: "pending" };
  return (
    <span className={`status status-${value.className}`}>
      <span aria-hidden="true" />
      {value.text}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {description && <p className="muted">{description}</p>}
    </div>
  );
}
