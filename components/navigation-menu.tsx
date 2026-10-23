"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A disclosure, rather than an ARIA menu: links retain familiar Tab navigation. */
export function NavigationMenu({
  label,
  children,
  className = "",
  summaryClassName = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details
      ref={ref}
      className={className}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a[href]") && ref.current)
          ref.current.open = false;
      }}
    >
      <summary className={summaryClassName}>{label}</summary>
      {children}
    </details>
  );
}
