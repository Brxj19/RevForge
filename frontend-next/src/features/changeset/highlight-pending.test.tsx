import { screen, within } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "~/test/app";

// Grammar chunks never arrive: highlighting stays pending for the whole test (B2). Views must
// render plain text instead of suspending the app-level <Suspense> and blanking the route.
vi.mock("~/lib/codemirror/languages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/codemirror/languages")>()),
  loadLanguage: () => new Promise(() => undefined),
}));

const IMPROV = "0b486fec60de599c0dfab1a065eca86a06651c31";

describe("syntax highlighting is progressive", () => {
  it("shows the changeset title and diff tables while tokens are pending", async () => {
    renderApp(`/sigma/sigma-reckitt/changesets/${IMPROV}`);
    const section = await screen.findByRole("region", {
      name: "src/binary_tree.hpp",
    });
    expect(document.getElementById("cs-title")).toHaveTextContent(
      "Improvements: add BinaryTree::contains",
    );
    const table = within(section).getByRole("table", {
      name: "Changes to src/binary_tree.hpp",
    });
    expect(table).toHaveTextContent("bool contains(int value) const;");
    expect(screen.getAllByRole("table").length).toBe(4);
  });

  it("shows blame lines while tokens are pending", async () => {
    renderApp("/sigma/sigma-reckitt/code/main.cpp?view=blame");
    const file = await screen.findByRole("article");
    expect(
      await within(file).findByText(/changesets? by 1 author shaped this file/),
    ).toBeInTheDocument();
    expect(file).toHaveTextContent('cout << "this is main file"<<endl;');
  });
});
