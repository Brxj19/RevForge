import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  accentPalettes,
  applyAccentPalette,
  clearAccentStorage,
} from "../app/accent-preference";
import { ContributionHeatmap } from "../components/dashboard/contribution-heatmap";
import type { ContributionActivity } from "../lib/api";

function buildContributionFixture(
  totalCounts: Record<string, number> = {},
): ContributionActivity {
  const start = new Date("2025-07-16T00:00:00Z");
  const days = Array.from({ length: 365 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return { date: iso, count: totalCounts[iso] ?? 0 };
  });

  return {
    total: days.reduce((sum, day) => sum + day.count, 0),
    range: {
      start_date: days[0].date,
      end_date: days[days.length - 1].date,
    },
    days,
  };
}

describe("ContributionHeatmap", () => {
  test("renders totals, month labels, weekday labels, and legend", () => {
    render(
      <ContributionHeatmap
        contributions={buildContributionFixture({
          "2026-01-10": 3,
          "2026-03-21": 1,
          "2026-07-15": 8,
        })}
      />,
    );

    expect(
      screen.getByText("12 repository contributions in the last year"),
    ).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Mar")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(365);
  });

  test("renders an empty heatmap without hiding the grid", () => {
    render(<ContributionHeatmap contributions={buildContributionFixture()} />);

    expect(
      screen.getByText("0 repository contributions in the last year"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(365);
  });

  test("renders a loading skeleton", () => {
    render(<ContributionHeatmap isLoading />);

    expect(
      screen.getByText(/loading contribution activity/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("contribution-skeleton")).toBeInTheDocument();
  });

  test("renders an error state with retry affordance", () => {
    render(<ContributionHeatmap error="backend timeout" />);

    expect(
      screen.getByText("Could not load contribution activity."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByText("backend timeout")).toBeInTheDocument();
  });

  test("uses palette-derived contribution color variables", () => {
    clearAccentStorage();
    applyAccentPalette(accentPalettes.tech);

    render(
      <ContributionHeatmap
        contributions={buildContributionFixture({ "2026-07-15": 8 })}
      />,
    );

    expect(
      document.documentElement.style.getPropertyValue("--rf-accent-tertiary"),
    ).toBe(accentPalettes.tech.active);
    expect(screen.getByTestId("contribution-legend-5")).toHaveStyle({
      backgroundColor: "var(--color-contrib-level-5)",
    });
  });
});
