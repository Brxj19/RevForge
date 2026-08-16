import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppProviders } from "../app/providers";
import { RepositoryDetailPage, RepositorySettingsPage } from "../routes/pages";

const readmeMarkdown = `# Repository Handbook

Repository docs stay readable.

| Name | Value |
| --- | --- |
| Accent | \`blue\` |
| Status | Ready |

- First item
- Second item

\`\`\`ts
const total = 42;
\`\`\`
`;

const rootNode = "1111111111111111111111111111111111111111";
const featureNode = "2222222222222222222222222222222222222222";
const mergeNode = "3333333333333333333333333333333333333333";

const graphChangesets = [
  {
    node: mergeNode,
    short_node: mergeNode.slice(0, 12),
    parents: [featureNode, rootNode],
    author_name: "Tatwa",
    author_email_when_available: "tatwa@example.com",
    timestamp: "2026-07-11T10:00:00Z",
    message: "Merge feature branch",
    branch: "default",
    files_changed_count_when_available: 4,
    insertions_when_available: 6,
    deletions_when_available: 2,
  },
  {
    node: featureNode,
    short_node: featureNode.slice(0, 12),
    parents: [rootNode],
    author_name: "Tatwa",
    author_email_when_available: "tatwa@example.com",
    timestamp: "2026-07-11T08:00:00Z",
    message: "Add repository graph page",
    branch: "feature/graph",
    files_changed_count_when_available: 2,
    insertions_when_available: 4,
    deletions_when_available: 1,
  },
  {
    node: rootNode,
    short_node: rootNode.slice(0, 12),
    parents: [],
    author_name: "Deepak",
    author_email_when_available: "deepak@example.com",
    timestamp: "2026-07-10T18:00:00Z",
    message: "Initial import",
    branch: "default",
    files_changed_count_when_available: 1,
    insertions_when_available: 1,
    deletions_when_available: 0,
  },
] as const;

const graphDetails = new Map([
  [
    featureNode,
    {
      node: featureNode,
      short_node: featureNode.slice(0, 12),
      parents: [rootNode],
      author_name: "Tatwa",
      author_email_when_available: "tatwa@example.com",
      timestamp: "2026-07-11T08:00:00Z",
      message: "Add repository graph page",
      branch: "feature/graph",
      tags: ["v0.9"],
      bookmarks: ["ui-redesign"],
      files_changed: [
        "frontend/src/routes/repository-graph.tsx",
        "frontend/src/components/repo/graph-view.tsx",
      ],
      files_changed_count_when_available: 2,
      insertions_when_available: 4,
      deletions_when_available: 1,
      changed_files: [
        {
          path: "frontend/src/routes/repository-graph.tsx",
          status: "modified",
          insertions: 2,
          deletions: 1,
          old_path: null,
        },
        {
          path: "frontend/src/components/repo/graph-view.tsx",
          status: "added",
          insertions: 2,
          deletions: 0,
          old_path: null,
        },
      ],
    },
  ],
  [
    rootNode,
    {
      node: rootNode,
      short_node: rootNode.slice(0, 12),
      parents: [],
      author_name: "Deepak",
      author_email_when_available: "deepak@example.com",
      timestamp: "2026-07-10T18:00:00Z",
      message: "Initial import",
      branch: "default",
      tags: [],
      bookmarks: [],
      files_changed: ["README.md"],
      files_changed_count_when_available: 1,
      insertions_when_available: 1,
      deletions_when_available: 0,
      changed_files: [
        {
          path: "README.md",
          status: "added",
          insertions: 1,
          deletions: 0,
          old_path: null,
        },
      ],
    },
  ],
]);

const graphDiffs = new Map([
  [
    featureNode,
    {
      content: `diff --git a/frontend/src/routes/repository-graph.tsx b/frontend/src/routes/repository-graph.tsx\n--- a/frontend/src/routes/repository-graph.tsx\n+++ b/frontend/src/routes/repository-graph.tsx\n@@ -1,1 +1,2 @@\n-old line\n+new line\n+another line\ndiff --git a/frontend/src/components/repo/graph-view.tsx b/frontend/src/components/repo/graph-view.tsx\n--- /dev/null\n+++ b/frontend/src/components/repo/graph-view.tsx\n@@ -0,0 +1,2 @@\n+graph row\n+graph lane\n`,
      is_truncated: false,
      truncation_reason_when_applicable: null,
    },
  ],
  [
    rootNode,
    {
      content: `diff -r 0000000000000000000000000000000000000000 ${rootNode}\n--- /dev/null\n+++ b/README.md\n@@ -0,0 +1,1 @@\n+hello world\n`,
      is_truncated: false,
      truncation_reason_when_applicable: null,
    },
  ],
]);

function renderRepositoryRoute(route: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path="/organizations/:organizationSlug/repositories/:repositorySlug/settings"
            element={<RepositorySettingsPage />}
          />
          <Route
            path="/organizations/:organizationSlug/repositories/:repositorySlug/*"
            element={<RepositoryDetailPage />}
          />
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
      const url = String(input);
      const requestUrl = new URL(url);

      if (url.includes("/api/v1/auth/me")) {
        return jsonResponse({
          id: "user-1",
          email: "owner@example.com",
          display_name: "Owner User",
          is_active: true,
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
        });
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/unprovisioned-repo",
        )
      ) {
        return jsonResponse({
          id: "repo-1",
          organization_id: "org-1",
          slug: "unprovisioned-repo",
          display_name: "Unprovisioned Repo",
          description: "Read-only browser is still locked.",
          visibility: "public",
          created_by_user_id: "user-1",
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
          archived_at: null,
          provisioning_state: "unprovisioned",
          provisioned_at: null,
          is_browsable: false,
          viewer_role: null,
          can_manage: false,
          inherited_access: false,
          organization_slug: "acme",
          phase_status: "Mercurial repository not provisioned yet.",
        });
      }

      if (
        url.includes("/api/v1/organizations/acme/repositories/managed-repo")
      ) {
        return jsonResponse({
          id: "repo-2",
          organization_id: "org-1",
          slug: "managed-repo",
          display_name: "Managed Repo",
          description: "Owners can provision this repository.",
          visibility: "private",
          created_by_user_id: "user-1",
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
          archived_at: null,
          provisioning_state: "failed",
          provisioned_at: null,
          is_browsable: false,
          viewer_role: "admin",
          can_manage: true,
          inherited_access: true,
          organization_slug: "acme",
          phase_status:
            "Mercurial provisioning failed. Try provisioning again.",
        });
      }

      if (
        url.includes("/api/v1/organizations/acme/repositories/ready-repo/refs")
      ) {
        return jsonResponse({
          branches: [
            {
              name: "release",
              node: "abcdef0123456789",
              short_node: "abcdef012345",
            },
          ],
          tags: [
            {
              name: "v1.0",
              node: "abcdef0123456789",
              short_node: "abcdef012345",
            },
          ],
          bookmarks: [
            {
              name: "main",
              node: "abcdef0123456789",
              short_node: "abcdef012345",
            },
          ],
        });
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/browse",
        ) &&
        requestUrl.searchParams.get("path") === "README.md"
      ) {
        return jsonResponse({
          kind: "file",
          revision: "abcdef0123456789",
          path: "README.md",
          content: readmeMarkdown,
          language_hint_when_available: "markdown",
          is_binary: false,
          is_too_large: false,
          size_when_known: readmeMarkdown.length,
        });
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/browse",
        )
      ) {
        return jsonResponse({
          kind: "directory",
          revision: "abcdef0123456789",
          path: "",
          entries: [
            { name: "src", path: "src", kind: "directory" },
            { name: "README.md", path: "README.md", kind: "file" },
          ],
        });
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/changesets/",
        ) &&
        url.includes("/diff")
      ) {
        const node = requestUrl.pathname
          .split("/changesets/")[1]
          ?.split("/")[0];
        return jsonResponse(
          graphDiffs.get(node ?? "") ?? {
            content: "",
            is_truncated: false,
            truncation_reason_when_applicable: null,
          },
        );
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/changesets/",
        )
      ) {
        const node = requestUrl.pathname
          .split("/changesets/")[1]
          ?.split("/")[0];
        return jsonResponse(
          graphDetails.get(node ?? "") ?? {
            node: node ?? rootNode,
            short_node: (node ?? rootNode).slice(0, 12),
            parents: [],
            author_name: "Unknown",
            author_email_when_available: null,
            timestamp: "2026-07-10T00:00:00Z",
            message: "Unknown changeset",
            branch: "default",
            tags: [],
            bookmarks: [],
            files_changed: [],
            files_changed_count_when_available: 0,
            insertions_when_available: null,
            deletions_when_available: null,
            changed_files: [],
          },
        );
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/changesets",
        )
      ) {
        return jsonResponse({
          changesets: graphChangesets,
          next_cursor: null,
        });
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/webhooks",
        ) &&
        !url.includes("/deliveries")
      ) {
        return jsonResponse([
          {
            id: "webhook-1",
            repository_id: "repo-3",
            url: "https://example.com/hooks/revforge",
            event_types: ["repository.push.accepted", "repository.provisioned"],
            is_active: true,
            created_by_user_id: "user-1",
            created_at: "2026-07-08T08:00:00Z",
            updated_at: "2026-07-08T08:00:00Z",
          },
        ]);
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/webhooks/webhook-1/deliveries",
        )
      ) {
        return jsonResponse([
          {
            id: "delivery-1",
            webhook_id: "webhook-1",
            event_type: "repository.push.accepted",
            request_url: "https://example.com/hooks/revforge",
            response_status_code: 200,
            status: "delivered",
            retry_count: 0,
            error_message: null,
            created_at: "2026-07-08T08:15:00Z",
            completed_at: "2026-07-08T08:15:01Z",
          },
        ]);
      }

      if (
        url.includes(
          "/api/v1/organizations/acme/repositories/ready-repo/events",
        )
      ) {
        return jsonResponse({
          events: [
            {
              id: "event-1",
              repository_id: "repo-3",
              event_type: "repository.push.accepted",
              actor_user_id: "user-1",
              actor_display_name: "Owner User",
              actor_email: "owner@example.com",
              authentication_method: "ssh",
              request_id: "req-123",
              summary: "Push accepted: 1 changeset over ssh",
              details: [
                { label: "Changesets received", value: "1" },
                { label: "Authentication", value: "ssh" },
              ],
              occurred_at: "2026-07-11T08:00:00Z",
            },
          ],
          total_count: 1,
        });
      }

      if (url.includes("/api/v1/organizations/acme/repositories/ready-repo")) {
        return jsonResponse({
          id: "repo-3",
          organization_id: "org-1",
          slug: "ready-repo",
          display_name: "Ready Repo",
          description: "Mercurial browser is ready.",
          visibility: "public",
          created_by_user_id: "user-1",
          created_at: "2026-07-05T08:00:00Z",
          updated_at: "2026-07-05T08:00:00Z",
          archived_at: null,
          provisioning_state: "ready",
          provisioned_at: "2026-07-05T08:05:00Z",
          is_browsable: true,
          viewer_role: "admin",
          can_manage: true,
          inherited_access: true,
          organization_slug: "acme",
          phase_status:
            "Mercurial repository is provisioned and ready for browsing.",
        });
      }

      return jsonResponse(
        {
          error: {
            code: "http_error",
            message: "Unhandled request in test.",
          },
        },
        500,
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("repository phase 2 pages", () => {
  test("renders the unprovisioned public repository state without a provision action", async () => {
    renderRepositoryRoute(
      "/organizations/acme/repositories/unprovisioned-repo",
    );

    expect(
      await screen.findByRole("heading", {
        name: /repository storage is not provisioned/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Provision Mercurial repository/i }),
    ).not.toBeInTheDocument();
  });

  test("shows the provision action for a manage-capable repository", async () => {
    renderRepositoryRoute("/organizations/acme/repositories/managed-repo");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Provision Mercurial repository/i }),
      ).toBeInTheDocument();
    });
  });

  test("renders the code browser for a ready repository", async () => {
    renderRepositoryRoute("/organizations/acme/repositories/ready-repo/code");

    expect(
      await screen.findByRole("combobox", { name: /Browse revision/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: /^src dir$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("treeitem", { name: /^README\.md file$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /select a file or folder/i }),
    ).toBeInTheDocument();
  });

  test("renders the repository overview with root entries and README preview", async () => {
    renderRepositoryRoute("/organizations/acme/repositories/ready-repo");

    expect(
      await screen.findByRole("heading", {
        name: /latest changeset and repository health/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Repository root")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /readme preview/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^src folder$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^README\.md file$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /clone and access/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /quick links/i }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/repository handbook/i)).toBeInTheDocument();
    expect(screen.getByText(/first item/i)).toBeInTheDocument();
    expect(screen.getByText(/const total = 42;/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /^src folder$/i }));

    expect(
      await screen.findByRole("combobox", { name: /Browse revision/i }),
    ).toBeInTheDocument();
  });

  test("renders repository webhooks and delivery history", async () => {
    renderRepositoryRoute(
      "/organizations/acme/repositories/ready-repo/settings?section=webhooks",
    );

    expect(
      await screen.findByRole("heading", { name: /webhooks/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/webhook url/i)).toBeInTheDocument();
    expect(
      await screen.findByText("https://example.com/hooks/revforge"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /deliveries/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /deliveries/i }));

    expect(await screen.findByText(/delivered/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/repository\.push\.accepted/i).length,
    ).toBeGreaterThan(0);
  });

  test("renders repository audit activity from backend events", async () => {
    renderRepositoryRoute(
      "/organizations/acme/repositories/ready-repo/settings?section=audit",
    );

    expect(
      await screen.findByRole("heading", { name: /audit/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/repository\.push\.accepted/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/owner user/i)).toBeInTheDocument();
    expect(screen.getByText(/req-123/i)).toBeInTheDocument();
    expect(
      screen.getByText(/push accepted: 1 changeset over ssh/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/changesets received/i)).toBeInTheDocument();
  });

  test("renders markdown preview in the code browser", async () => {
    renderRepositoryRoute(
      "/organizations/acme/repositories/ready-repo/code?path=README.md",
    );

    expect(
      await screen.findByRole("heading", { name: /repository handbook/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/second item/i)).toBeInTheDocument();
    expect(screen.getByText(/const total = 42;/i)).toBeInTheDocument();
  });

  test("renders the repository graph page and updates selection", async () => {
    renderRepositoryRoute(
      `/organizations/acme/repositories/ready-repo/graph?node=${featureNode}`,
    );

    expect(
      await screen.findByRole("heading", {
        name: /changeset graph/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hash/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: featureNode.slice(0, 12) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /add repository graph page/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(
      screen.getAllByText(/frontend\/src\/routes\/repository-graph\.tsx/i)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("+2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /initial import/i }));

    expect(
      await screen.findByRole("heading", { name: rootNode.slice(0, 12) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /initial import/i }),
    ).toBeInTheDocument();
  });

  test("changeset detail uses per-file stats and focuses a selected file", async () => {
    renderRepositoryRoute(
      `/organizations/acme/repositories/ready-repo/changesets/${featureNode}?file=${encodeURIComponent("frontend/src/routes/repository-graph.tsx")}`,
    );

    expect(
      await screen.findByRole("heading", { name: featureNode.slice(0, 12) }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("+2 -1").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /focused file: frontend\/src\/routes\/repository-graph\.tsx/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "new line"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /diff --git a\/frontend\/src\/components\/repo\/graph-view\.tsx b\/frontend\/src\/components\/repo\/graph-view\.tsx/i,
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /frontend\/src\/components\/repo\/graph-view\.tsx/i,
      }),
    );

    expect(screen.getAllByText("+2 -0").length).toBeGreaterThan(0);
    expect(
      await screen.findByText(
        /focused file: frontend\/src\/components\/repo\/graph-view\.tsx/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "graph row"),
    ).toBeInTheDocument();
  });

  test("graph changed file click opens the history diff for that file", async () => {
    renderRepositoryRoute(
      `/organizations/acme/repositories/ready-repo/graph?node=${featureNode}`,
    );

    expect(
      await screen.findByRole("heading", { name: featureNode.slice(0, 12) }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /frontend\/src\/components\/repo\/graph-view\.tsx/i,
      }),
    );

    expect(
      await screen.findByText(
        /focused file: frontend\/src\/components\/repo\/graph-view\.tsx/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to history/i }),
    ).toBeInTheDocument();
  });
});
