import { activityHandlers } from "./activity";
import { adminHandlers } from "./admin";
import { authHandlers } from "./auth";
import { healthHandlers } from "./health";
import { meHandlers } from "./me";
import { orgHandlers } from "./orgs";
import { pullHandlers } from "./pulls";
import { repoHandlers } from "./repos";
import { repoSettingsHandlers } from "./repo-settings";
import { searchHandlers } from "./search";
import { settingsHandlers } from "./settings";
import { userHandlers } from "./users";

export const handlers = [
  ...adminHandlers,
  ...healthHandlers,
  ...authHandlers,
  ...meHandlers,
  ...orgHandlers,
  ...repoHandlers,
  ...repoSettingsHandlers,
  ...pullHandlers,
  ...settingsHandlers,
  ...searchHandlers,
  ...userHandlers,
  ...activityHandlers,
];
export { apiError } from "./util";
