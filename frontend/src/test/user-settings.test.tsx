import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../app/providers";
import { seedAccentStorage } from "../app/accent-preference";
import { UserSettingsPage } from "../routes/user-settings";

function renderSettings(route = "/settings?tab=tokens") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/settings" element={<UserSettingsPage />} />
          <Route path="/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/v1/auth/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "user-1",
              email: "owner@example.com",
              display_name: "Owner User",
              is_active: true,
              created_at: "2026-07-01T10:00:00Z",
              updated_at: "2026-07-01T10:00:00Z",
            }),
            { status: 200 },
          ),
        );
      }

      if (url.includes("/api/v1/auth/csrf")) {
        return Promise.resolve(
          new Response(JSON.stringify({ csrf_token: "csrf-token" }), {
            status: 200,
          }),
        );
      }

      if (url.includes("/api/v1/me/tokens") && init?.method !== "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "tok-1",
                name: "Local Clone",
                token_prefix: "abc12345",
                capability: "write",
                created_at: "2026-07-01T10:00:00Z",
                last_used_at: null,
                revoked_at: null,
              },
            ]),
            { status: 200 },
          ),
        );
      }

      if (url.includes("/api/v1/me/ssh-keys")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "key-1",
                label: "Laptop",
                key_type: "ssh-ed25519",
                fingerprint_sha256: "SHA256:testfingerprint",
                created_at: "2026-07-01T10:00:00Z",
                last_used_at: null,
                revoked_at: null,
              },
            ]),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: "http_error",
              message: `Unhandled request for ${url}`,
            },
          }),
          { status: 500 },
        ),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("user settings", () => {
  test("renders live personal access tokens", async () => {
    renderSettings("/settings?tab=tokens");

    expect(
      await screen.findByRole("heading", { name: /personal access tokens/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/local clone/i)).toBeInTheDocument();
    expect(screen.getByText(/prefix abc12345/i)).toBeInTheDocument();
  });

  test("renders live SSH keys", async () => {
    renderSettings("/settings?tab=ssh-keys");

    expect(await screen.findByText(/^Laptop$/i)).toBeInTheDocument();
    expect(screen.getByText(/SHA256:testfingerprint/i)).toBeInTheDocument();
  });

  test("persists the selected accent palette", async () => {
    seedAccentStorage("tech");

    renderSettings("/settings?tab=preferences");

    const techPalette = await screen.findByRole("button", {
      name: /tech & cyber/i,
    });
    expect(techPalette).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /premium & luxury/i }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-accent", "luxury");
    });
    expect(document.documentElement).toHaveAttribute("data-accent", "luxury");
  });
});
