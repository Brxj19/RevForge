import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { buildCells, Heatmap, heatmapStats, levelFor } from ".";

const TODAY = new Date(2026, 9, 5); // Mon 5 Oct 2026
const DAYS = [
  {
    date: "2026-10-05",
    count: 3,
    byRepo: [{ name: "sigma-reckitt", color: "#58a6ff", count: 3 }],
    additions: 40,
    deletions: 2,
  },
  { date: "2026-10-04", count: 9 },
  { date: "2026-10-03", count: 1 },
];

describe("heatmap data", () => {
  it("lays out Monday-first weeks ending this week, marking the future", () => {
    const cells = buildCells(DAYS, TODAY, 30);
    expect(cells).toHaveLength(210);
    expect(cells[0]!.weekday).toBe(0);
    expect(new Date(`${cells[0]!.date}T00:00:00`).getDay()).toBe(1);
    const today = cells.find((c) => c.date === "2026-10-05")!;
    expect(today.week).toBe(29);
    expect(cells.filter((c) => c.future)).toHaveLength(6);
  });
  it("buckets levels and computes streaks", () => {
    expect([0, 1, 3, 6, 12].map(levelFor)).toEqual([0, 1, 2, 3, 4]);
    const s = heatmapStats(buildCells(DAYS, TODAY, 30));
    expect(s.total).toBe(13);
    expect(s.busiest?.date).toBe("2026-10-04");
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
    expect(s.activeDays).toBe(3);
  });
});

describe("<Heatmap>", () => {
  it("moves with arrow keys, describes the active day and pins it with Enter", async () => {
    render(() => <Heatmap days={DAYS} today={TODAY} />);
    const grid = screen.getByRole("grid");
    grid.focus();
    expect(grid.getAttribute("aria-activedescendant")).toBe(`heat-${29 * 7}`);
    expect(document.getElementById(`heat-${29 * 7}`)).toHaveAccessibleName(
      /3 changesets on Mon,? 5 Oct 2026/,
    );
    await userEvent.keyboard("{ArrowRight}");
    expect(grid.getAttribute("aria-activedescendant")).toBe(`heat-${29 * 7}`);
    await userEvent.keyboard("{ArrowUp}");
    expect(grid.getAttribute("aria-activedescendant")).toBe(
      `heat-${29 * 7 - 1}`,
    );
    await userEvent.keyboard("{ArrowDown}{Enter}");
    const panel = screen.getByRole("region", { name: /Mon,? 5 Oct 2026/ });
    expect(panel).toHaveTextContent("sigma-reckitt");
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: /Mon,? 5 Oct 2026/ }),
    ).toBeNull();
  });
  it("shows the summary stats", () => {
    render(() => <Heatmap days={DAYS} today={TODAY} />);
    expect(screen.getByText(/Busiest day/)).toHaveTextContent(
      "Busiest day 4 Oct, 9 changesets",
    );
    expect(screen.getByText(/Current streak/)).toHaveTextContent("3 days");
  });
});
