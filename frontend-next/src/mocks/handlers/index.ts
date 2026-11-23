import { authHandlers } from "./auth";
import { healthHandlers } from "./health";
import { meHandlers } from "./me";
import { orgHandlers } from "./orgs";
import { pullHandlers } from "./pulls";
import { repoHandlers } from "./repos";
import { repoSettingsHandlers } from "./repo-settings";
import { settingsHandlers } from "./settings";

export const handlers = [
  ...healthHandlers,
  ...authHandlers,
  ...meHandlers,
  ...orgHandlers,
  ...repoHandlers,
  ...repoSettingsHandlers,
  ...pullHandlers,
  ...settingsHandlers,
];
export { apiError } from "./util";
