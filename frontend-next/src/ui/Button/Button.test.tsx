import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonLink } from ".";

describe("Button", () => {
  it("defaults to a secondary, medium, type=button", () => {
    render(() => <Button>Save</Button>);
    const b = screen.getByRole("button", { name: "Save" });
    expect(b).toHaveAttribute("type", "button");
    expect(b).toHaveAttribute("data-variant", "secondary");
    expect(b).toHaveAttribute("data-size", "md");
  });

  it.each(["primary", "ghost", "danger", "danger-solid"] as const)(
    "renders the %s variant",
    (variant) => {
      render(() => <Button variant={variant}>Go</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "data-variant",
        variant,
      );
    },
  );

  it("is disabled and busy while loading, and doesn't fire clicks", async () => {
    const onClick = vi.fn();
    render(() => (
      <Button loading onClick={onClick}>
        Saving
      </Button>
    ));
    const b = screen.getByRole("button", { name: "Saving" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is keyboard operable", async () => {
    const onClick = vi.fn();
    render(() => <Button onClick={onClick}>Create token</Button>);
    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a link styled as a button", () => {
    render(() => (
      <ButtonLink href="/" variant="primary">
        Go home
      </ButtonLink>
    ));
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute(
      "data-variant",
      "primary",
    );
  });
});
