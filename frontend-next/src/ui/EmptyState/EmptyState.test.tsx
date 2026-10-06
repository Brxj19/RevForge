import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { EmptyState } from ".";
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
