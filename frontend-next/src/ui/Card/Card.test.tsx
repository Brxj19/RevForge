import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Card, CardBody, CardFooter, CardHeader } from ".";

describe("Card", () => {
  it("composes header, body and footer, with a sticky header option", () => {
    render(() => (
      <Card as="section" aria-label="Danger zone" tone="danger">
        <CardHeader sticky>Title</CardHeader>
        <CardBody>Body</CardBody>
        <CardFooter>Footer</CardFooter>
      </Card>
    ));
    const card = screen.getByRole("region", { name: "Danger zone" });
    expect(card.tagName).toBe("SECTION");
    expect(card).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("Title")).toHaveAttribute("data-sticky", "true");
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });
});
