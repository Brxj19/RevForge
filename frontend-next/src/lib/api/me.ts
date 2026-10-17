import { request } from "./client";
import type { ContributionActivity, PinList, PinRef } from "./types";

export const MAX_PINS = 8;

export const meApi = {
  contributions: () =>
    request<ContributionActivity>("/me/contributions?range=last_year"),
  // API-GAP: pins — backend endpoint not built yet; served by MSW, with a local fallback in the shell.
  pins: () => request<PinList>("/me/pins"),
  setPins: (items: PinRef[], csrf: string | null) =>
    request<PinList>("/me/pins", {
      method: "PUT",
      json: { items: items.slice(0, MAX_PINS) },
      csrf,
    }),
};
