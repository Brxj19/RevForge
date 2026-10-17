import { describe, expect, it } from "vitest";
import { isNumeric, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF and trailing newlines", () => {
    const { rows } = parseCsv('a,b\r\n"x, y","say ""hi"""\n1,2\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
  });
  it("stops at the row cap and reports truncation", () => {
    const text = Array.from({ length: 10 }, (_, i) => `${i}`).join("\n");
    const r = parseCsv(text, 3);
    expect(r.rows).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });
  it("detects numbers", () => {
    expect(isNumeric("12.5")).toBe(true);
    expect(isNumeric("-3e2")).toBe(true);
    expect(isNumeric("12ms")).toBe(false);
  });
});
