import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BINARY_TYPE,
  downloadBlob,
  REVOKE_DELAY_MS,
  TEXT_TYPE,
} from "./download";

describe("downloadBlob (F8)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses an explicit type and revokes the object URL only after a delay", async () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:mock/1";
    });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadBlob("<script>alert(1)</script>", "evil.html", TEXT_TYPE);

    expect(click).toHaveBeenCalledTimes(1);
    expect(blobs[0]?.type).toBe("text/plain;charset=utf-8");
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith("blob:mock/1");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("re-wraps binary data so the declared type wins over the source blob's", () => {
    const blobs: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return "blob:mock/2";
      },
      revokeObjectURL: () => undefined,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    downloadBlob(
      new Blob(["<svg/>"], { type: "image/svg+xml" }),
      "logo.svg",
      BINARY_TYPE,
    );
    expect(blobs[0]?.type).toBe("application/octet-stream");
  });
});
