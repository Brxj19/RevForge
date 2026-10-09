import { screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "~/mocks/server";
import { renderApp } from "~/test/app";
import { rangeParts } from "./ranges";
import { validCodeQuery } from "./sources";

async function openPalette(prefix: string) {
  await screen.findByRole("heading", { level: 1, name: /sigma-reckitt/ });
  await userEvent.click(
    screen.getByRole("button", { name: "Search or run a command" }),
  );
  const input = await screen.findByRole("combobox", {
    name: "Search or run a command",
  });
  await userEvent.type(input, prefix);
  return input;
}

describe("palette code search (/)", () => {
  it("searches the code at the URL's revision, debounced, and opens the file at the line", async () => {
    const seen: URL[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/search/code")) seen.push(new URL(request.url));
    });
    renderApp("/sigma/sigma-reckitt?rev=v0.1.0");
    const input = await openPalette("/");
    expect(
      await screen.findByText("Type to search inside files at v0.1.0."),
    ).toBeInTheDocument();
    await userEvent.type(input, "add_edge");
    const group = await screen.findByText("Matches in sigma-reckitt");
    expect(group).toBeInTheDocument();
    const options = await screen.findAllByRole("option", { name: /add_edge/ });
    expect(options.length).toBeGreaterThan(1);
    // Hits are marked as text, never injected as HTML.
    expect(
      within(options[0]!).getByText("add_edge", { selector: "mark" }),
    ).toBeInTheDocument();
    // One request for the whole word (debounced), at the revision in the URL.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.searchParams.get("q")).toBe("add_edge");
    expect(seen[0]?.searchParams.get("rev")).toBe("v0.1.0");
    const main = options.find((o) => o.textContent?.includes("main.cpp:"));
    expect(main).toBeDefined();
    await userEvent.click(main!);
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        "/sigma/sigma-reckitt/code/main.cpp",
      ),
    );
    const params = new URLSearchParams(window.location.search);
    expect(params.get("rev")).toBe("v0.1.0");
    expect(Number(params.get("L"))).toBeGreaterThan(0);
    server.events.removeAllListeners();
  });

  it("waits for 2 characters and explains a server error", async () => {
    server.use(
      http.get(
        "*/api/v1/organizations/sigma/repositories/sigma-reckitt/search/code",
        () =>
          new Response(
            JSON.stringify({
              error: {
                code: "rate_limited",
                message: "Too many",
                request_id: "r1",
              },
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "5",
              },
            },
          ),
      ),
    );
    renderApp("/sigma/sigma-reckitt");
    const input = await openPalette("/");
    await userEvent.type(input, "a");
    expect(
      await screen.findByText("Type at least 2 characters to search the code."),
    ).toBeInTheDocument();
    await userEvent.type(input, "d");
    expect(
      await screen.findByText(
        "Code search is busy. Wait a moment, then try again.",
      ),
    ).toBeInTheDocument();
  });

  it("~ opens files on the new code route", async () => {
    renderApp("/sigma/sigma-reckitt");
    const input = await openPalette("~");
    await userEvent.type(input, "graph.hpp");
    const option = (
      await screen.findAllByRole("option", { name: /^graph\.hpp/ })
    )[0]!;
    await userEvent.click(option);
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        "/sigma/sigma-reckitt/code/src/graph.hpp",
      ),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "graph.hpp" }),
    ).toBeInTheDocument();
  });
});

describe("code search helpers", () => {
  it("validates queries like the server contract", () => {
    expect(validCodeQuery("a")).toBe(false);
    expect(validCodeQuery("ab")).toBe(true);
    expect(validCodeQuery("a\nb")).toBe(false);
    expect(validCodeQuery("x".repeat(201))).toBe(false);
  });
  it("turns server ranges into highlight parts", () => {
    expect(rangeParts("g.add_edge(0,1);", [[2, 10]])).toEqual([
      { text: "g.", hit: false },
      { text: "add_edge", hit: true },
      { text: "(0,1);", hit: false },
    ]);
    expect(
      rangeParts("ab", [
        [-3, 1],
        [5, 9],
      ]),
    ).toEqual([
      { text: "a", hit: true },
      { text: "b", hit: false },
    ]);
  });
});
