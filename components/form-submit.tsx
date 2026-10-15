"use client";

import { useFormStatus } from "react-dom";

export function FormSubmit({
  children,
  secondary = false,
  pendingLabel = "Salvando…",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  secondary?: boolean;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`button${secondary ? " button-secondary" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
