import type { CSSProperties } from "react";
import { Button } from "../ui/button";
import type { ContributionActivity, ContributionDay } from "../../lib/api";
import { ContributionHeatmapCell } from "./contribution-heatmap-cell";

interface ContributionHeatmapProps {
  contributions?: ContributionActivity;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

interface HeatmapCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  label: string;
}

type HeatmapWeek = Array<HeatmapCell | null>;

const weekdayLabels = ["Mon", "", "Wed", "", "Fri", "", ""];
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});
const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function parseUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shiftUtcDate(value: Date, days: number) {
  const shifted = new Date(value);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function weekdayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

function levelForCount(count: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  if (count <= 7) return 4;
  return 5;
}

function labelForDay(day: ContributionDay) {
  const formattedDate = longDateFormatter.format(parseUtcDate(day.date));
  return day.count > 0
    ? `${day.count} contribution${day.count === 1 ? "" : "s"} on ${formattedDate}`
    : `No contributions on ${formattedDate}`;
}

function buildWeeks(days: ContributionDay[]): HeatmapWeek[] {
  if (days.length === 0) {
    return [];
  }

  const contributionsByDate = new Map(days.map((day) => [day.date, day]));
  const firstDay = parseUtcDate(days[0].date);
  const lastDay = parseUtcDate(days[days.length - 1].date);
  const gridStart = shiftUtcDate(firstDay, -weekdayIndex(firstDay));
  const gridEnd = shiftUtcDate(lastDay, 6 - weekdayIndex(lastDay));
  const weeks: HeatmapWeek[] = [];

  for (
    let cursor = new Date(gridStart);
    cursor <= gridEnd;
    cursor = shiftUtcDate(cursor, 7)
  ) {
    const week: HeatmapWeek = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const currentDate = shiftUtcDate(cursor, dayOffset);
      const isoDate = formatIsoDate(currentDate);
      const contribution = contributionsByDate.get(isoDate);
      if (!contribution) {
        week.push(null);
        continue;
      }
      week.push({
        date: contribution.date,
        count: contribution.count,
        level: levelForCount(contribution.count),
        label: labelForDay(contribution),
      });
    }
    weeks.push(week);
  }

  return weeks;
}

function buildMonthLabels(weeks: HeatmapWeek[]) {
  let lastMonth = -1;
  return weeks.map((week) => {
    const firstVisibleCell = week.find((entry) => entry !== null);
    if (!firstVisibleCell) {
      return "";
    }
    const month = parseUtcDate(firstVisibleCell.date).getUTCMonth();
    if (month === lastMonth) {
      return "";
    }
    lastMonth = month;
    return monthFormatter.format(parseUtcDate(firstVisibleCell.date));
  });
}

function formatContributionTotal(total: number) {
  return `${total} repository contribution${total === 1 ? "" : "s"} in the last year`;
}

function gridTemplateColumns(columnCount: number): CSSProperties {
  return {
    gridTemplateColumns: `repeat(${columnCount}, minmax(var(--rf-contrib-cell-size), 1fr))`,
  };
}

function renderSkeletonWeeks(columnCount: number) {
  return (
    <div className="rf-contribution-grid" data-testid="contribution-skeleton">
      <div
        className="rf-contribution-months"
        style={gridTemplateColumns(columnCount)}
      >
        {Array.from({ length: columnCount }, (_, index) => (
          <div
            key={`month-skeleton-${index}`}
            className="h-3 rounded-sm bg-surface-muted/80"
          />
        ))}
      </div>
      <div className="rf-contribution-body">
        <div className="rf-contribution-weekdays" aria-hidden="true">
          {weekdayLabels.map((label, index) => (
            <span key={`weekday-skeleton-${index}`}>{label}</span>
          ))}
        </div>
        <div
          className="rf-contribution-weeks animate-pulse"
          style={gridTemplateColumns(columnCount)}
        >
          {Array.from({ length: columnCount * 7 }, (_, index) => (
            <div
              key={`cell-skeleton-${index}`}
              className="rf-contribution-cell"
              style={{ backgroundColor: "var(--color-contrib-empty)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ContributionHeatmap({
  contributions,
  isLoading = false,
  error = null,
  onRetry,
}: ContributionHeatmapProps) {
  const days = contributions?.days ?? [];
  const weeks = buildWeeks(days);
  const monthLabels = buildMonthLabels(weeks);
  const visibleWeekCount = weeks.length > 0 ? weeks.length : 53;
  const total = contributions?.total ?? 0;

  if (isLoading) {
    return (
      <div className="grid gap-4" aria-live="polite">
        <div>
          <p className="text-base font-medium text-text-primary">
            Loading contribution activity.
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Building a 365-day view from your real repository events.
          </p>
        </div>
        {renderSkeletonWeeks(visibleWeekCount)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-4" role="alert">
        <div>
          <p className="text-base font-medium text-text-primary">
            Could not load contribution activity.
          </p>
          <p className="mt-1 text-sm text-text-muted">
            RevForge could not read your last-year repository activity right
            now.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onRetry} type="button" variant="secondary">
            Retry
          </Button>
          <span className="text-xs text-text-subtle">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className="text-base font-medium text-text-primary"
            data-testid="contribution-total"
          >
            {formatContributionTotal(total)}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Real control-plane and repository actions performed by your account
            from {contributions?.range.start_date ?? "the start of the range"}{" "}
            to {contributions?.range.end_date ?? "today"}.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="rf-contribution-grid">
          <div
            className="rf-contribution-months"
            style={gridTemplateColumns(visibleWeekCount)}
          >
            {monthLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>

          <div className="rf-contribution-body">
            <div className="rf-contribution-weekdays" aria-hidden="true">
              {weekdayLabels.map((label, index) => (
                <span key={`weekday-${label || index}`}>{label}</span>
              ))}
            </div>

            <div
              aria-label="Contribution activity heatmap"
              className="rf-contribution-weeks"
              role="grid"
              style={gridTemplateColumns(visibleWeekCount)}
            >
              {weeks.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="rf-contribution-week">
                  {week.map((entry, dayIndex) =>
                    entry ? (
                      <ContributionHeatmapCell
                        key={entry.date}
                        count={entry.count}
                        label={entry.label}
                        level={entry.level}
                      />
                    ) : (
                      <div
                        key={`pad-${weekIndex}-${dayIndex}`}
                        aria-hidden="true"
                        className="rf-contribution-cell"
                        style={{ backgroundColor: "transparent" }}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-text-muted">
        <span>Less</span>
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <div
            key={`legend-${level}`}
            aria-hidden="true"
            className="rf-contribution-cell"
            data-testid={`contribution-legend-${level}`}
            style={{ backgroundColor: `var(--color-contrib-level-${level})` }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
