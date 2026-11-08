"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** A submit button that shows progress while its form's server action runs. */
export function SubmitButton({ children, pending, className = "btn btn-primary" }: { children: ReactNode; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} aria-busy={busy}>
      {busy ? <><span className="spin" aria-hidden="true" /> {pending}</> : children}
    </button>
  );
}
