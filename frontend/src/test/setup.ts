import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { clearAccentStorage } from "../app/accent-preference";

beforeEach(() => {
  clearAccentStorage();
});
