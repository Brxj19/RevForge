import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  HOVER_OPEN_DELAY,
  HOVER_SWITCH_DELAY,
  HoverCard,
  HoverCardSection,
  hoverCardOpenDelay,
  isHoverCardOpen,
} from ".";

function Two() {
  return (
    <>
      <HoverCard
        trigger="a"
        triggerProps={{ href: "#a" }}
        triggerContent="first"
        label="Card A"
      >
        <HoverCardSection>Alpha</HoverCardSection>
      </HoverCard>
      <HoverCard
        trigger="a"
        triggerProps={{ href: "#b" }}
        triggerContent="second"
        label="Card B"
      >
        <HoverCardSection>Beta</HoverCardSection>
      </HoverCard>
    </>
  );
}

describe("HoverCard", () => {
  it("opens after the hover delay", async () => {
    vi.useFakeTimers();
    render(() => (
      <HoverCard
        trigger="a"
        triggerProps={{ href: "#c" }}
        triggerContent="1c7450e15fcb"
      >
        <HoverCardSection>
          Merge feature/data-structures-improvements into default
        </HoverCardSection>
      </HoverCard>
    ));
    fireEvent.pointerEnter(screen.getByText("1c7450e15fcb"), {
      pointerType: "mouse",
    });
    vi.advanceTimersByTime(300);
    expect(screen.queryByText(/Merge feature/)).toBeNull();
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
    expect(await screen.findByText(/Merge feature/)).toBeInTheDocument();
  });

  it("uses 450ms normally and 90ms while switching between triggers", () => {
    // A card closed moments ago (the previous test) still counts as switching.
    expect(hoverCardOpenDelay(Date.now())).toBe(HOVER_SWITCH_DELAY);
    expect(hoverCardOpenDelay(Date.now() + 1000)).toBe(HOVER_OPEN_DELAY);
  });

  it("shows one card at a time, switches quickly and closes on Escape", async () => {
    render(() => <Two />);
    fireEvent.pointerEnter(screen.getByText("first"), { pointerType: "mouse" });
    expect(
      await screen.findByRole("group", { name: "Card A" }),
    ).toHaveTextContent("Alpha");
    expect(isHoverCardOpen()).toBe(true);
    expect(hoverCardOpenDelay()).toBe(HOVER_SWITCH_DELAY);
    fireEvent.pointerEnter(screen.getByText("second"), {
      pointerType: "mouse",
    });
    expect(await screen.findByRole("group", { name: "Card B" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Card A" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Card B" })).toBeNull(),
    );
    expect(isHoverCardOpen()).toBe(false);
  });

  it("opens on keyboard focus and closes on scroll", async () => {
    render(() => <Two />);
    screen.getByText("first").focus();
    await screen.findByRole("group", { name: "Card A" });
    fireEvent.scroll(window);
    fireEvent.scroll(document.body);
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Card A" })).toBeNull(),
    );
  });

  it("stays closed after a press on the trigger", async () => {
    render(() => <Two />);
    const a = screen.getByText("first");
    fireEvent.pointerEnter(a, { pointerType: "mouse" });
    fireEvent.pointerDown(a, { pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, HOVER_OPEN_DELAY + 100));
    expect(screen.queryByRole("group", { name: "Card A" })).toBeNull();
  });
});
