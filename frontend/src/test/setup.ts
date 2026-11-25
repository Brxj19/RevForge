import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@solidjs/testing-library";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { resetMockDb } from "~/mocks/db";
import { server } from "~/mocks/server";

// jsdom gaps used by Kobalte (toast swipe, popper positioning, scrolling into view).
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView)
  Element.prototype.scrollIntoView = () => undefined;
if (!window.matchMedia)
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;

// Lazy routes (CodeMirror, Markdown) compile on first use; under a parallel run that can take
// longer than the 1s default.
configure({ asyncUtilTimeout: 4000 });

// jsdom has no layout: CodeMirror measures text through Range rects.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
}
if (!document.elementFromPoint) document.elementFromPoint = () => null;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetMockDb();
  try {
    localStorage.clear();
  } catch {
    // storage unavailable
  }
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
