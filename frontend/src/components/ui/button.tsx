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
    "bg-accent text-white hover:bg-forge-600 focus-visible:ring-accent disabled:opacity-50",
  secondary:
    "bg-surface text-ink-950 border border-border hover:bg-surface-subtle focus-visible:ring-accent disabled:opacity-50",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-surface-subtle focus-visible:ring-accent disabled:opacity-50",
  danger:
    "bg-danger text-white hover:opacity-90 focus-visible:ring-danger disabled:opacity-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs rounded-sm",
  md: "h-8 px-3 text-sm rounded-sm",
  lg: "h-9 px-4 text-sm rounded-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer",
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
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
