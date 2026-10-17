import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useUrlState } from "./url";

function setup(route: string) {
  const history = createMemoryHistory();
  history.set({ value: route, replace: true });
  function Page() {
    const [s, set] = useUrlState(
      { q: "", view: "graph", page: 1 },
      { view: ["graph", "list"] },
    );
    return (
      <>
        <input
          aria-label="Filter"
          value={s.q}
          onInput={(e) =>
            set({ q: e.currentTarget.value }, { replace: true, debounce: 250 })
          }
        />
        <span data-testid="view">{s.view}</span>
        <span data-testid="page">{s.page}</span>
        <button onClick={() => set({ view: "list" })}>List</button>
        <button onClick={() => set({ view: "graph" })}>Graph</button>
      </>
    );
  }
  render(() => (
    <MemoryRouter history={history}>
      <Route path="*" component={Page} />
    </MemoryRouter>
  ));
  return history;
}

describe("useUrlState", () => {
  it("reads typed values and falls back for unknown ones", () => {
    setup("/h?view=bogus&page=3");
    expect(screen.getByTestId("view")).toHaveTextContent("graph");
    expect(screen.getByTestId("page")).toHaveTextContent("3");
  });

  it("omits defaults from the URL and pushes discrete choices", async () => {
    const history = setup("/h");
    await userEvent.click(screen.getByRole("button", { name: "List" }));
    expect(history.get()).toBe("/h?view=list");
    await userEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(history.get()).toBe("/h");
    history.back();
    expect(history.get()).toBe("/h?view=list");
  });

  it("debounces typing into one replaced entry (F5)", async () => {
    const history = setup("/h");
    const entries: string[] = [];
    history.listen((v) => entries.push(v));
    await userEvent.type(screen.getByLabelText("Filter"), "push");
    await new Promise((r) => setTimeout(r, 320));
    expect(history.get()).toBe("/h?q=push");
    expect(entries).toEqual(["/h?q=push"]);
    history.back();
    expect(history.get()).toBe("/h?q=push");
  });
});
