import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import {
  displayKeys,
  handleShortcutKey,
  registeredShortcuts,
  useShortcut,
} from "./keyboard";
import { isReservedSlug } from "./reserved";

const press = (key: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  handleShortcutKey(e);
  return e;
};

describe("keyboard shortcuts", () => {
  it("runs single keys, chords and mod combos, and unregisters on cleanup", () => {
    const home = vi.fn();
    const palette = vi.fn();
    const help = vi.fn();
    const dispose = createRoot((d) => {
      useShortcut({ keys: "g h", description: "Go home", run: home });
      useShortcut({
        keys: "mod+k",
        description: "Command palette",
        allowInInputs: true,
        run: palette,
      });
      useShortcut({ keys: "?", description: "Shortcuts", run: help });
      return d;
    });
    press("g");
    press("h");
    expect(home).toHaveBeenCalledTimes(1);
    expect(press("k", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(palette).toHaveBeenCalledTimes(1);
    press("?");
    expect(help).toHaveBeenCalledTimes(1);
    dispose();
    expect(registeredShortcuts()).toHaveLength(0);
  });

  it("ignores plain keys while typing", () => {
    const run = vi.fn();
    const dispose = createRoot((d) => {
      useShortcut({ keys: "/", description: "Search", run });
      return d;
    });
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    press("/");
    expect(run).not.toHaveBeenCalled();
    input.remove();
    dispose();
  });

  it("formats keys for display", () => {
    expect(displayKeys("g h")).toEqual(["G", "H"]);
    expect(displayKeys("mod+k").at(-1)).toBe("K");
  });

  it("knows reserved slugs", () => {
    expect(isReservedSlug("Settings")).toBe(true);
    expect(isReservedSlug("sigma")).toBe(false);
  });
});
