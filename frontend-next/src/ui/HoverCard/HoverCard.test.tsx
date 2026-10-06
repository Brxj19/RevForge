import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { HoverCard, HoverCardSection } from ".";

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
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    expect(await screen.findByText(/Merge feature/)).toBeInTheDocument();
  });
});
