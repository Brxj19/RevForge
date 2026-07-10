import { describe, expect, test } from "vitest";
import { getPrimaryNavActive } from "../lib/app-shell-nav";

describe("app shell navigation state", () => {
  test("prefers repositories over organization for repository routes", () => {
    const repositoryItem = {
      label: "Repositories",
      to: "/repositories",
    };
    const organizationItem = {
      label: "Organization",
      to: "/organizations",
    };

    expect(
      getPrimaryNavActive(
        repositoryItem,
        "/organizations/acme/repositories/demo",
      ),
    ).toBe(true);
    expect(
      getPrimaryNavActive(
        organizationItem,
        "/organizations/acme/repositories/demo",
      ),
    ).toBe(false);
  });

  test("keeps organization active on organization pages", () => {
    const organizationItem = {
      label: "Organization",
      to: "/organizations",
    };

    expect(getPrimaryNavActive(organizationItem, "/organizations/acme")).toBe(
      true,
    );
    expect(getPrimaryNavActive(organizationItem, "/repositories")).toBe(false);
  });
});
