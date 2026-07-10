import { type SelectHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, children, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={clsx(
            "h-8 w-full rounded-sm border bg-surface px-2.5 text-sm text-text-primary outline-none transition-colors appearance-none",
            "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20width%3D%2210%22%20height%3D%226%22%20viewBox%3D%220%200%2010%206%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M1%201l4%204%204-4%22%20stroke%3D%22%23718096%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_6px] bg-[right_10px_center] bg-no-repeat pr-8",
            error
              ? "border-danger focus:border-danger focus:ring-1 focus:ring-danger"
              : "border-border focus:border-accent focus:ring-1 focus:ring-accent",
            className,
          )}
          aria-invalid={error ? "true" : undefined}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p className="text-xs text-danger" role="alert">{error}</p>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";
