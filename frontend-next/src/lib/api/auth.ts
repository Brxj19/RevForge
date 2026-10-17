import { request } from "./client";
import type { CsrfResponse, SessionResponse, Viewer } from "./types";

export const authApi = {
  me: () => request<Viewer>("/auth/me"),
  csrf: () => request<CsrfResponse>("/auth/csrf"),
  login: (body: { email: string; password: string }) =>
    request<SessionResponse>("/auth/login", { method: "POST", json: body }),
  register: (body: { email: string; display_name: string; password: string }) =>
    request<SessionResponse>("/auth/register", { method: "POST", json: body }),
  logout: (csrf: string | null) =>
    request<undefined>("/auth/logout", { method: "POST", csrf }),
};
