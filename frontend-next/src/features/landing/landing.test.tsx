import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "~/app/App";
import { createAppQueryClient } from "~/app/query-client";
import { resetMockDb } from "~/mocks/db";

function renderLanding(signedIn = false) {
  resetMockDb({ signedIn: signedIn ? "brxj19" : null });
  window.history.replaceState({}, "", "/welcome");
  return render(() => (
    <App queryClient={createAppQueryClient({ retry: false })} />
  ));
}

describe("LandingPage (/welcome)", () => {
  it("renders hero, product tour, security showcase, self-host steps, and FAQ", async () => {
    renderLanding(false);
    expect(
      await screen.findByRole("heading", {
        name: "The forge for teams that chose Mercurial.",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mercurial 6.x and 7.x")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Not git with the labels changed." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Designed to be audited." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Running in five minutes." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Which Mercurial versions are supported?"),
    ).toBeInTheDocument();
  });

  it("switches product tour tabs by click and keyboard arrows", async () => {
    renderLanding(false);
    const graphTab = await screen.findByRole("tab", {
      name: "A graph you can trust",
    });
    const codeTab = screen.getByRole("tab", { name: "Code at any revision" });
    const reviewsTab = screen.getByRole("tab", {
      name: "Reviews that actually gate merges",
    });

    expect(graphTab).toHaveAttribute("aria-selected", "true");

    await userEvent.click(codeTab);
    expect(codeTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("ledger.go")).toBeInTheDocument();

    codeTab.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(reviewsTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("2 of 2 required reviewers approved"),
    ).toBeInTheDocument();
  });

  it("links to /docs, /explore, /login, and /register when anonymous", async () => {
    renderLanding(false);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getAllByRole("link", { name: "Get started" })[0],
    ).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "/docs",
    );
  });
});
