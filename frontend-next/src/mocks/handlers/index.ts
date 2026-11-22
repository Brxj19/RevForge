import { authHandlers } from "./auth";
import { healthHandlers } from "./health";
import { meHandlers } from "./me";
import { orgHandlers } from "./orgs";
import { pullHandlers } from "./pulls";
import { repoHandlers } from "./repos";

export const handlers = [
  ...healthHandlers,
  ...authHandlers,
  ...meHandlers,
  ...orgHandlers,
  ...repoHandlers,
  ...pullHandlers,
];
export { apiError } from "./util";
