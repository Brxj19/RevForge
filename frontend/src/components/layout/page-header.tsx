import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-forge-600">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-text-primary">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-4xl text-sm text-text-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
