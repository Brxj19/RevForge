import type { CSSProperties } from "react";

interface ContributionHeatmapCellProps {
  count: number;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
}

export function ContributionHeatmapCell({
  count,
  level,
  label,
}: ContributionHeatmapCellProps) {
  return (
    <div
      aria-label={label}
      className="rf-contribution-cell"
      data-count={count}
      data-level={level}
      role="gridcell"
      tabIndex={0}
      title={label}
      style={
        {
          backgroundColor: `var(--color-contrib-level-${level})`,
        } satisfies CSSProperties
      }
    />
  );
}
