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
        "inline-flex items-center justify-center bg-surface text-text-secondary shadow-panel transition-colors hover:bg-accent-subtle hover:text-accent-hover",
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
