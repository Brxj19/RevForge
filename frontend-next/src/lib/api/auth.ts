import { request } from "./client";
import type {
  AcceptedActionResponse,
  CsrfResponse,
  PasswordResetConfirmResponse,
  SessionResponse,
  VerifyEmailResponse,
  Viewer,
} from "./types";

export const authApi = {
  me: () => request<Viewer>("/auth/me"),
  csrf: () => request<CsrfResponse>("/auth/csrf"),
  login: (body: { email: string; password: string; remember_me?: boolean }) =>
    request<SessionResponse>("/auth/login", { method: "POST", json: body }),
  register: (body: {
    email: string;
    display_name: string;
    password: string;
    handle?: string;
  }) =>
    request<AcceptedActionResponse>("/auth/register", {
      method: "POST",
      json: body,
    }),
  logout: (csrf: string | null) =>
    request<undefined>("/auth/logout", { method: "POST", csrf }),
  verifyEmail: (token: string) =>
    request<VerifyEmailResponse>("/auth/verify-email", {
      method: "POST",
      json: { token },
    }),
  resendVerification: (email: string) =>
    request<AcceptedActionResponse>("/auth/verify-email/resend", {
      method: "POST",
      json: { email },
    }),
  requestPasswordReset: (email: string) =>
    request<AcceptedActionResponse>("/auth/password-reset", {
      method: "POST",
      json: { email },
    }),
  confirmPasswordReset: (token: string, newPassword: string) =>
    request<PasswordResetConfirmResponse>("/auth/password-reset/confirm", {
      method: "POST",
      json: { token, new_password: newPassword },
    }),
};
