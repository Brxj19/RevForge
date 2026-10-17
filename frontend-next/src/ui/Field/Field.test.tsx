import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { Field, Input, InputGroup, Textarea } from ".";

describe("Field", () => {
  it("labels the control and links the hint", () => {
    render(() => (
      <Field label="Slug" hint="Appears in every repository URL.">
        <Input placeholder="acme-labs" />
      </Field>
    ));
    const input = screen.getByLabelText("Slug");
    expect(input).toHaveAccessibleDescription(
      "Appears in every repository URL.",
    );
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("replaces the hint with the error and marks the control invalid", async () => {
    const [error, setError] = createSignal<string>();
    render(() => (
      <Field label="Public key" hint="Paste the .pub file" error={error()}>
        <Textarea mono />
      </Field>
    ));
    const ta = screen.getByLabelText("Public key");
    await userEvent.type(ta, "ssh-rsa");
    setError("That key is too short.");
    expect(ta).toHaveAttribute("aria-invalid", "true");
    expect(ta).toHaveAccessibleDescription("That key is too short.");
    expect(screen.queryByText("Paste the .pub file")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That key is too short.",
    );
  });

  it("marks optional fields", () => {
    render(() => (
      <Field label="Secret" optional>
        <Input type="password" />
      </Field>
    ));
    expect(screen.getByLabelText("Secret (optional)")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("renders input groups with prefix and suffix", () => {
    render(() => (
      <Field label="Name">
        <InputGroup
          prefix="sigma/"
          suffix={<kbd>/</kbd>}
          placeholder="repo-name"
        />
      </Field>
    ));
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "placeholder",
      "repo-name",
    );
    expect(screen.getByText("sigma/")).toBeInTheDocument();
  });

  it("supports disabled inputs", () => {
    render(() => <Input aria-label="Org" value="sigma" disabled />);
    expect(screen.getByLabelText("Org")).toBeDisabled();
  });
});
