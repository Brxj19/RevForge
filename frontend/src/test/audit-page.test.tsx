import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../app/providers";
import { AuditPage } from "../routes/audit";

function renderAuditPage(route = "/activity") {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/activity" element={<AuditPage />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v1/auth/me") {
        return jsonResponse({
          id: "user-1",
          email: "owner@example.com",
          display_name: "Owner User",
          is_active: true,
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
        });
      }

      if (url.pathname === "/api/v1/audit") {
        const offset = Number(url.searchParams.get("offset") ?? "0");
        if (offset === 20) {
          return jsonResponse({
            events: [
              {
                id: "event-2",
                actor_user_id: "user-1",
                actor_display_name: "Owner User",
                actor_email: "owner@example.com",
                organization_id: "org-1",
                repository_id: "repo-1",
                event_type: "repository.created",
                request_id: "req-2",
                summary: "Created repository Repo Two",
                details: [{ label: "repository", value: "Repo Two" }],
                created_at: "2026-07-14T10:00:00Z",
              },
            ],
            total_count: 21,
          });
        }

        return jsonResponse({
          events: [
            {
              id: "event-1",
              actor_user_id: "user-1",
              actor_display_name: "Owner User",
              actor_email: "owner@example.com",
              organization_id: "org-1",
              repository_id: "repo-1",
              event_type: "organization.created",
              request_id: "req-1",
              summary: "Created organization Acme",
              details: [{ label: "organization", value: "Acme" }],
              created_at: "2026-07-14T09:00:00Z",
            },
          ],
          total_count: 21,
        });
      }

      return jsonResponse(
        {
          error: {
            code: "not_found",
            message: `Unhandled request: ${url.pathname}${url.search}`,
          },
        },
        404,
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditPage", () => {
  test("pages through audit activity", async () => {
    renderAuditPage("/activity");

    expect(
      await screen.findByRole("heading", { name: /audit and operational activity/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("req-2")).toBeInTheDocument();
    expect(screen.queryByText("req-1")).not.toBeInTheDocument();
  });
});
