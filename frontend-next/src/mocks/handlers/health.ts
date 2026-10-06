import { http, HttpResponse } from "msw";

export const healthHandlers = [
  http.get("*/health", () =>
    HttpResponse.json({ status: "ok", service: "revforge-backend" }),
  ),
  http.get("*/api/v1/health", () =>
    HttpResponse.json({
      status: "ok",
      service: "revforge-api",
      api_version: "v1",
    }),
  ),
];
