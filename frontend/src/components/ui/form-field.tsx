import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function FormField({ label, hint, children }: FormFieldProps) {
  return (
    <label className="grid gap-2">
      <span className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}
