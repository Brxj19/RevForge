import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Table, Td, Th } from ".";

describe("Table", () => {
  it("renders a captioned table with sortable and numeric columns", async () => {
    const onSort = vi.fn();
    render(() => (
      <Table caption="Members">
        <thead>
          <tr>
            <Th sort="ascending" onSort={onSort}>
              Name
            </Th>
            <Th>Role</Th>
            <Th numeric>Last active</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>Brxj19</Td>
            <Td>owner</Td>
            <Td numeric>now</Td>
          </tr>
        </tbody>
      </Table>
    ));
    expect(screen.getByRole("table", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(
      screen.getByRole("columnheader", { name: "Role" }),
    ).not.toHaveAttribute("aria-sort");
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(onSort).toHaveBeenCalled();
    expect(screen.getByRole("cell", { name: "now" })).toHaveAttribute(
      "data-numeric",
      "true",
    );
  });
});
