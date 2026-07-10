import type { ReactNode } from "react";
import clsx from "clsx";

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  inset?: boolean;
}

export function Surface({ children, className, inset = false }: SurfaceProps) {
  return (
    <section
      className={clsx(
        "rounded-lg border border-border bg-surface shadow-panel",
        inset ? "p-3" : "p-4 md:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
