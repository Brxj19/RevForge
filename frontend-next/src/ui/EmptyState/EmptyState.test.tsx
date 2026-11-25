import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, QueryState, classifyError } from ".";
import { Button } from "../Button";

describe("EmptyState", () => {
  it("uses the illustration's copy by default with a decorative image", () => {
    const { container } = render(() => (
      <EmptyState
        art="no-ssh-keys"
        actions={<Button variant="primary">Add SSH key</Button>}
      />
    ));
    expect(
      screen.getByRole("heading", { name: "No SSH keys yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add your public key/)).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector("svg")).toHaveAttribute("width", "140");
    expect(
      screen.getByRole("button", { name: "Add SSH key" }),
    ).toBeInTheDocument();
  });

  it("shows a copyable request id for server errors", () => {
    render(() => (
      <EmptyState
        art="load-error"
        title="Couldn't load history."
        size="page"
        requestId="req-123"
      />
    ));
    expect(
      screen.getByRole("heading", { name: "Couldn't load history." }),
    ).toBeInTheDocument();
    expect(screen.getByText("req-123")).toBeInTheDocument();
  });
});

describe("ErrorState & classifyError", () => {
  it("maps network, rate-limit, auth, permission, 404, and 5xx errors to the right illustrations", () => {
    expect(classifyError({ isNetworkError: true, status: 0 }).art).toBe(
      "offline",
    );
    expect(classifyError({ status: 429 }).art).toBe("rate-limited");
    expect(classifyError({ status: 401 }).art).toBe("session-expired");
    expect(classifyError({ status: 403 }).art).toBe("permission-denied");
    expect(classifyError({ status: 404 }).art).toBe("not-found");
    const server = classifyError(
      { status: 502, requestId: "req-502" },
      "activity",
    );
    expect(server.art).toBe("load-error");
    expect(server.title).toBe("Couldn't load activity");
    expect(server.requestId).toBe("req-502");
  });

  it("renders offline illustration and retry button on network errors", () => {
    const retry = vi.fn();
    const { container } = render(() => (
      <ErrorState
        error={{ status: 0, isNetworkError: true }}
        what="repositories"
        onRetry={retry}
      />
    ));
    expect(
      container.querySelector('[data-illustration="offline"]'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("QueryState", () => {
  it("renders loading skeleton while pending without reading data", () => {
    render(() => (
      <QueryState<string[]>
        isPending={true}
        isError={false}
        data={undefined}
        what="repositories"
      >
        {(items) => <div>{items().length}</div>}
      </QueryState>
    ));
    expect(
      screen.getByRole("status", { name: "Loading repositories" }),
    ).toBeInTheDocument();
  });

  it("renders ErrorState when failed and EmptyState when empty", () => {
    const { unmount } = render(() => (
      <QueryState<string[]>
        isPending={false}
        isError={true}
        error={{ status: 429 }}
        data={undefined}
        what="pull requests"
      >
        {(items) => <div>{items().length}</div>}
      </QueryState>
    ));
    expect(
      screen.getByRole("heading", { name: "Too many requests" }),
    ).toBeInTheDocument();
    unmount();

    render(() => (
      <QueryState<string[]>
        isPending={false}
        isError={false}
        data={[]}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState art="no-pulls" />}
      >
        {(items) => <div>{items().length}</div>}
      </QueryState>
    ));
    expect(
      screen.getByRole("heading", { name: "No pull requests yet" }),
    ).toBeInTheDocument();
  });

  it("renders children when data is ready and non-empty", () => {
    render(() => (
      <QueryState<string[]>
        isPending={false}
        isError={false}
        data={["sigma-reckitt"]}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState art="no-repos" />}
      >
        {(items) => <div>{items()[0]}</div>}
      </QueryState>
    ));
    expect(screen.getByText("sigma-reckitt")).toBeInTheDocument();
  });
});
