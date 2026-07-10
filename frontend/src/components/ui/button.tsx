import { type ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active disabled:bg-surface-muted disabled:text-text-disabled",
  secondary:
    "bg-accent-subtle text-accent hover:bg-accent-subtle hover:text-accent-hover disabled:bg-surface-subtle disabled:text-text-disabled",
  ghost:
    "text-text-secondary hover:bg-accent-subtle hover:text-accent-hover disabled:text-text-disabled",
  danger:
    "bg-danger-subtle text-danger hover:bg-danger-subtle hover:text-danger disabled:text-text-disabled",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-sm",
  md: "h-9 px-3.5 text-sm rounded-sm",
  lg: "h-10 px-4 text-sm rounded-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      className,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium shadow-panel transition-colors",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.25"
            />
            <path
              d="M8 2a6 6 0 0 1 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
