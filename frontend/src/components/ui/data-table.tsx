import type { ReactNode } from "react";
import clsx from "clsx";

interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (item: T) => string;
  loading?: boolean;
  emptyState?: ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyFn,
  loading,
  emptyState,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div
        className={clsx(
          "divide-y divide-border rounded-sm border border-border",
          className,
        )}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-2">
            {columns.map((col) => (
              <div
                key={col.key}
                className="h-4 flex-1 animate-pulse rounded bg-surface-subtle"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  "px-3 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((item) => (
            <tr
              key={keyFn(item)}
              className="border-b border-border-muted transition-colors hover:bg-surface-hover/70"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx(
                    "align-top px-3 py-2 text-sm text-text-primary",
                    col.className,
                  )}
                >
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
