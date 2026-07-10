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
  default: "bg-surface-subtle text-text-secondary",
  primary: "bg-accent-subtle text-accent",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
  neutral: "bg-surface-muted text-text-primary",
};

export function Badge({
  variant = "default",
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[11px] font-medium uppercase leading-tight tracking-[0.14em]",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
