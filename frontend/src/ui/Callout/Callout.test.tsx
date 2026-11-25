import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Callout } from ".";

describe("Callout", () => {
  it("announces errors as alerts", () => {
    render(() => (
      <Callout tone="err" title="Push rejected">
        infra-scripts is still provisioning.
      </Callout>
    ));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-tone", "err");
    expect(alert).toHaveTextContent("Push rejected");
  });
  it.each(["info", "ok", "warn"] as const)("renders %s as a status", (tone) => {
    render(() => <Callout tone={tone} title="Heads up" />);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", tone);
  });
});
