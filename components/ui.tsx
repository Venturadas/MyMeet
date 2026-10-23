import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import type { Appointment } from "@/lib/types";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-intro page-header ${className}`}>
      <div className="page-header-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
        {children}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading section-header">
      <div>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {action && <div className="section-header-action">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon || <CalendarDays size={24} />}
      </span>
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

const statusLabels: Record<Appointment["status"], string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export function StatusBadge({ status }: { status: Appointment["status"] }) {
  return (
    <span className={`status status-${status}`}>{statusLabels[status]}</span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function ErrorState({ description }: { description: ReactNode }) {
  return (
    <div className="notice error error-state" role="alert">
      <p>{description}</p>
      <a className="button button-secondary" href="">
        Tentar novamente
      </a>
    </div>
  );
}
