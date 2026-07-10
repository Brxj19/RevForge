import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  size?: "sm" | "md";
}

const sizeStyles = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

export function IconButton({
  size = "md",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex items-center justify-center rounded-sm border border-border bg-surface text-text-secondary shadow-panel transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-text-primary",
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
