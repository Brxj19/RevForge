import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** Node MSW server for Vitest (started in src/test/setup.ts). */
export const server = setupServer(...handlers);
