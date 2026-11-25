export interface HeatmapRepoCount {
  name: string;
  color: string;
  count: number;
}

export interface HeatmapDay {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  count: number;
  byRepo?: readonly HeatmapRepoCount[];
  additions?: number;
  deletions?: number;
}

export interface HeatmapCell extends HeatmapDay {
  week: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  future: boolean;
  level: 0 | 1 | 2 | 3 | 4;
}

export const levelFor = (n: number): 0 | 1 | 2 | 3 | 4 =>
  n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 7 ? 3 : 4;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Lay out `weeks` Monday-first columns ending with the week containing `today`.
 * Days missing from `days` count as 0; days after `today` are future (hidden).
 */
export function buildCells(
  days: readonly HeatmapDay[],
  today: Date,
  weeks = 30,
): HeatmapCell[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
  const cells: HeatmapCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = iso(d);
    const day = byDate.get(key);
    const future = d > today;
    const count = future ? 0 : (day?.count ?? 0);
    cells.push({
      ...(day ?? {}),
      date: key,
      count,
      week: Math.floor(i / 7),
      weekday: i % 7,
      future,
      level: levelFor(count),
    });
  }
  return cells;
}

export interface HeatmapStats {
  total: number;
  busiest: HeatmapCell | undefined;
  longestStreak: number;
  currentStreak: number;
  activeDays: number;
  days: number;
}

export function heatmapStats(cells: readonly HeatmapCell[]): HeatmapStats {
  const live = cells.filter((c) => !c.future);
  let best = 0;
  let run = 0;
  for (const c of live) {
    run = c.count ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let cur = 0;
  for (let i = live.length - 1; i >= 0 && (live[i]?.count ?? 0) > 0; i--) cur++;
  return {
    total: live.reduce((s, c) => s + c.count, 0),
    busiest: live.reduce<HeatmapCell | undefined>(
      (a, b) => (!a || b.count > a.count ? b : a),
      undefined,
    ),
    longestStreak: best,
    currentStreak: cur,
    activeDays: live.filter((c) => c.count).length,
    days: live.length,
  };
}
