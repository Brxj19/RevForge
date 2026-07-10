import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DevHealthCard } from "../components/dev-health-card";

describe("dev health card", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders successful backend and api health states", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "ok", service: "revforge-backend" }),
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            service: "revforge-api",
            api_version: "v1",
          }),
          {
            status: 200,
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <DevHealthCard />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/revforge-backend reported ok/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/revforge-api v1 reported ok/i),
      ).toBeInTheDocument();
    });
  });
});
