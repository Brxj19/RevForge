import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { App } from "~/app/App";
import { createAppQueryClient } from "~/app/query-client";
import { resetMockDb } from "~/mocks/db";

function renderError(path: string) {
  resetMockDb({ signedIn: "brxj19" });
  window.history.replaceState({}, "", path);
  return render(() => (
    <App queryClient={createAppQueryClient({ retry: false })} />
  ));
}

describe("ErrorPage (/error/:code)", () => {
  it("renders a valid request_id on /error/500 with a copy button", async () => {
    renderError("/error/500?request_id=req_01JB8Q2V9XK3");
    expect(
      await screen.findByRole("heading", {
        name: "Something went wrong on our side",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("req_01JB8Q2V9XK3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy reference/i }),
    ).toBeInTheDocument();
  });

  it("rejects spoofed/invalid request_id query strings on /error/500", async () => {
    renderError("/error/500?request_id=Call%20scam%20support%20now");
    expect(
      await screen.findByRole("heading", {
        name: "Something went wrong on our side",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Call scam/i)).not.toBeInTheDocument();
  });

  it("renders validated retry_after countdown on /error/429 and ignores out-of-range values", async () => {
    const first = renderError("/error/429?retry_after=90");
    expect(
      await screen.findByRole("heading", { name: "Slow down a little" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Try again in 01:30/)).toBeInTheDocument();
    first.unmount();

    renderError("/error/429?retry_after=9999999");
    expect(
      await screen.findByRole("heading", { name: "Slow down a little" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Try again in about a minute/i),
    ).toBeInTheDocument();
  });

  it("renders 404 page on /error/404", async () => {
    renderError("/error/404");
    expect(
      await screen.findByRole("heading", { name: "No page at this address" }),
    ).toBeInTheDocument();
  });
});
