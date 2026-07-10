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
      <div className={clsx("divide-y divide-border rounded-sm border border-border", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-2.5">
            {columns.map((col) => (
              <div key={col.key} className="h-4 flex-1 animate-pulse rounded bg-surface-subtle" />
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
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  "px-3 py-2 text-left text-xs font-medium text-text-muted",
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
              className="transition-colors hover:bg-surface-subtle/50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx("px-3 py-2 text-sm text-text-primary", col.className)}
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
