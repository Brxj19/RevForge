import { describe, expect, it } from "vitest";
import { screen, waitFor, fireEvent } from "@solidjs/testing-library";
import { renderWithProviders, fixtureUsers } from "~/test/render";
import { NotificationBell } from "./NotificationBell";

describe("NotificationBell", () => {
  it("renders a bell button with accessible label", async () => {
    renderWithProviders(() => <NotificationBell />, {
      user: fixtureUsers.brxj19,
    });
    // The button has role="button" and an aria-label containing "Notifications"
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const bellBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("Notifications"),
      );
      expect(bellBtn).toBeTruthy();
    });
  });

  it("includes unread count in the label when unread exist", async () => {
    renderWithProviders(() => <NotificationBell />, {
      user: fixtureUsers.brxj19,
    });
    // The MSW handler returns 3 unread notifications
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const bellBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("3 unread"),
      );
      expect(bellBtn).toBeTruthy();
      // Unread dot sits inside the trigger button, not inside the popover body.
      expect(bellBtn?.querySelector("[class*='dot']")).toBeTruthy();
    });
  });

  it("opens popover on click and shows unread group", async () => {
    renderWithProviders(() => <NotificationBell />, {
      user: fixtureUsers.brxj19,
    });
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const bellBtn = buttons.find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("Notifications"),
      );
      expect(bellBtn).toBeTruthy();
    });
    const buttons = screen.getAllByRole("button");
    const bellBtn = buttons.find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Notifications"),
    );
    fireEvent.click(bellBtn as HTMLElement);
    expect(await screen.findByText("Unread")).toBeInTheDocument();
  });

  it("shows earlier group in the popover", async () => {
    renderWithProviders(() => <NotificationBell />, {
      user: fixtureUsers.brxj19,
    });
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      return buttons.find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("Notifications"),
      );
    });
    const buttons = screen.getAllByRole("button");
    const bellBtn = buttons.find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Notifications"),
    );
    fireEvent.click(bellBtn as HTMLElement);
    expect(await screen.findByText("Earlier")).toBeInTheDocument();
  });

  it("shows notification items", async () => {
    renderWithProviders(() => <NotificationBell />, {
      user: fixtureUsers.brxj19,
    });
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      return buttons.find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("Notifications"),
      );
    });
    const buttons = screen.getAllByRole("button");
    const bellBtn = buttons.find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Notifications"),
    );
    fireEvent.click(bellBtn as HTMLElement);
    expect(
      await screen.findByText("Tatwa Prasad requested your review"),
    ).toBeInTheDocument();
  });

  it("shows Mark all read button when unread notifications exist", async () => {
    renderWithProviders(() => <NotificationBell />, {
      user: fixtureUsers.brxj19,
    });
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      return buttons.find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("Notifications"),
      );
    });
    const buttons = screen.getAllByRole("button");
    const bellBtn = buttons.find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Notifications"),
    );
    fireEvent.click(bellBtn as HTMLElement);
    expect(
      await screen.findByText("Mark all read"),
    ).toBeInTheDocument();
  });

  it("shows notification settings link in popover", async () => {
    renderWithProviders(() => <NotificationBell />, {
      user: fixtureUsers.brxj19,
    });
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      return buttons.find((b) =>
        (b.getAttribute("aria-label") ?? "").includes("Notifications"),
      );
    });
    const buttons = screen.getAllByRole("button");
    const bellBtn = buttons.find((b) =>
      (b.getAttribute("aria-label") ?? "").includes("Notifications"),
    );
    fireEvent.click(bellBtn as HTMLElement);
    expect(
      await screen.findByText("Notification settings"),
    ).toBeInTheDocument();
  });
});
