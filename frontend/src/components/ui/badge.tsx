import type { ReactNode } from "react";
import clsx from "clsx";

type BadgeVariant =
  "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-subtle text-text-secondary border border-border",
  primary: "bg-accent-subtle text-accent border border-accent/20",
  success: "bg-success-subtle text-success border border-success/20",
  warning: "bg-warning-subtle text-warning border border-warning/20",
  danger: "bg-danger-subtle text-danger border border-danger/20",
  info: "bg-info-subtle text-info border border-info/20",
  neutral: "bg-ink-800 text-slate-100 border border-slate-700",
};

export function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
