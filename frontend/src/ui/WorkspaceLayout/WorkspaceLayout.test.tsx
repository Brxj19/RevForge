import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { DocumentPage, Pane, Panes, Workspace, WsBody } from ".";

describe("WorkspaceLayout", () => {
  it("composes independently scrolling panes with configurable columns", () => {
    render(() => (
      <Workspace data-testid="ws">
        <WsBody>
          <Panes columns="272px minmax(0,1fr)" data-testid="panes">
            <Pane as="nav" aria-label="Explorer" flush collapseOnNarrow>
              tree
            </Pane>
            <Pane as="section" aria-label="File">
              file
            </Pane>
          </Panes>
        </WsBody>
      </Workspace>
    ));
    expect(
      screen.getByTestId("panes").style.getPropertyValue("--panes-columns"),
    ).toBe("272px minmax(0,1fr)");
    const nav = screen.getByRole("navigation", { name: "Explorer" });
    expect(nav).toHaveAttribute("data-flush", "true");
    expect(nav).toHaveAttribute("data-collapse", "true");
    expect(screen.getByRole("region", { name: "File" })).toBeInTheDocument();
  });

  it("renders document pages", () => {
    render(() => <DocumentPage>content</DocumentPage>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
