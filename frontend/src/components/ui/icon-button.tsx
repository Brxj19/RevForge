import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  size?: "sm" | "md";
}

const sizeStyles = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
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
        "inline-flex items-center justify-center rounded-sm text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors",
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
