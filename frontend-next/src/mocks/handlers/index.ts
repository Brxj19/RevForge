import { authHandlers } from "./auth";
import { healthHandlers } from "./health";
import { meHandlers } from "./me";
import { orgHandlers } from "./orgs";
import { repoHandlers } from "./repos";

export const handlers = [
  ...healthHandlers,
  ...authHandlers,
  ...meHandlers,
  ...orgHandlers,
  ...repoHandlers,
];
export { apiError } from "./util";
