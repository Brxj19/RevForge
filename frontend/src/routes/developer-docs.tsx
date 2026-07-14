import { useMemo, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../app/use-auth";
import { MarkdownRenderer } from "../components/markdown";
import { PageHeader } from "../components/layout/page-header";
import { EmptyState } from "../components/states";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Surface } from "../components/ui/surface";
import {
  developerDocGroups,
  developerDocPageBySlug,
  developerDocPagesInOrder,
} from "../content/developer-docs";

interface HeadingLink {
  id: string;
  label: string;
  level: number;
}

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildHeadingId(prefix: string, label: string, index: number) {
  return `${prefix}-${slugifyHeading(label) || "section"}-${index}`;
}

function isGroupOpen(
  groupId: string,
  activeGroupId: string | undefined,
  hasFilter: boolean,
) {
  return hasFilter || activeGroupId === groupId;
}

function extractHeadings(markdown: string, prefix: string) {
  const headings: HeadingLink[] = [];
  let count = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^(##|###)\s+(.*)$/);
    if (!match) continue;
    const level = match[1].length;
    const label = match[2].trim();
    count += 1;
    headings.push({
      id: buildHeadingId(prefix, label, count),
      label,
      level,
    });
  }
  return headings;
}

interface DeveloperDocsSidebarProps {
  filter: string;
  headings: HeadingLink[];
  pageGroupId?: string;
  pageSlug?: string;
}

interface DeveloperDocsToolbarProps {
  filter: string;
  onFilterChange: (value: string) => void;
}

function DeveloperDocsToolbar({
  filter,
  onFilterChange,
}: DeveloperDocsToolbarProps) {
  return (
    <Surface className="grid gap-4 px-4 py-4 md:px-5 md:py-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)_auto] lg:items-end lg:gap-5">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
          Developer docs
        </p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          A forge for revisions.
          RevForge is a self-hosted Mercurial platform for repository hosting,
          changeset browsing, code review workflows, clone access, and
          operational visibility.
        </p>
      </div>
      <Input
        aria-label="Filter developer docs"
        label="Filter pages"
        placeholder="Find setup, SSH, webhooks..."
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
      />
      <Link className="lg:self-end" to="/developer-docs">
        <Button className="w-full lg:w-auto" variant="secondary">
          Docs index
        </Button>
      </Link>
    </Surface>
  );
}

function DeveloperDocsSidebar({
  filter,
  headings,
  pageGroupId,
  pageSlug,
}: DeveloperDocsSidebarProps) {
  const hasFilter = filter.trim().length > 0;
  const filteredGroups = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    return developerDocGroups
      .map((group) => ({
        ...group,
        pages: developerDocPagesInOrder.filter((candidate) => {
          if (candidate.groupId !== group.id) {
            return false;
          }
          if (!normalized) {
            return true;
          }
          return (
            candidate.title.toLowerCase().includes(normalized) ||
            candidate.summary.toLowerCase().includes(normalized)
          );
        }),
      }))
      .filter((group) => group.pages.length > 0);
  }, [filter]);

  return (
    <aside className="xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)] xl:min-h-0">
      <div className="grid gap-3 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1">
        {filteredGroups.map((group) => (
          <Surface key={group.id} className="p-0">
            <details
              className="group"
              open={isGroupOpen(group.id, pageGroupId, hasFilter)}
            >
              <summary className="cursor-pointer list-none border-b border-border px-4 py-3 transition-colors hover:bg-surface-subtle">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {group.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                      {group.description}
                    </p>
                  </div>
                  <span className="pt-1 text-text-muted transition-transform group-open:rotate-90">
                    ▸
                  </span>
                </div>
              </summary>
              <div className="grid gap-1 p-2">
                <nav className="grid gap-1" aria-label={`${group.title} pages`}>
                  {group.pages.map((candidate) => {
                    const isActive = candidate.slug === pageSlug;
                    return (
                      <div key={candidate.slug} className="grid gap-1">
                        <NavLink
                          to={`/developer-docs/${candidate.slug}`}
                          className={({ isActive: navActive }) =>
                            clsx(
                              "px-3 py-2 text-sm transition-colors",
                              navActive
                                ? "bg-accent-subtle text-accent"
                                : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
                            )
                          }
                        >
                          {candidate.title}
                        </NavLink>
                        {isActive && headings.length > 0 ? (
                          <div className="ml-3 grid gap-1 border-l border-border pl-3 py-1">
                            {headings.map((heading) => (
                              <a
                                key={heading.id}
                                className={clsx(
                                  "text-sm text-text-secondary transition-colors hover:text-text-primary",
                                  heading.level === 3 && "pl-3 text-xs",
                                )}
                                href={`#${heading.id}`}
                              >
                                {heading.label}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </nav>
              </div>
            </details>
          </Surface>
        ))}
      </div>
    </aside>
  );
}

function DeveloperDocsIndex() {
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-4 md:px-6 md:pb-12 md:pt-6 lg:px-8">
      <DeveloperDocsToolbar filter={filter} onFilterChange={setFilter} />

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <DeveloperDocsSidebar
          filter={filter}
          headings={[]}
          pageSlug={undefined}
          pageGroupId={undefined}
        />

        <main className="min-w-0 space-y-6">
          <PageHeader
            eyebrow="Developer Docs"
            title="Complete developer documentation for RevForge"
            description="This documentation system is designed for real local setup and real Mercurial use in this branch: accurate commands, honest feature status, and route-based navigation before and after sign-in."
            actions={
              isAuthenticated ? (
                <>
                  <Link to="/repositories">
                    <Button variant="secondary">Repositories</Button>
                  </Link>
                  <Link to="/activity">
                    <Button>Activity</Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="secondary">Sign in</Button>
                  </Link>
                  <Link to="/register">
                    <Button>Get started</Button>
                  </Link>
                </>
              )
            }
          />

          <Surface className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  Start here
                </p>
                <h2 className="mt-2 text-lg font-semibold text-text-primary">
                  Recommended reading order
                </h2>
              </div>
              <div className="grid gap-3">
                {developerDocPagesInOrder.slice(0, 6).map((page, index) => (
                  <Link
                    key={page.slug}
                    className="border border-border bg-canvas px-4 py-4 transition-colors hover:bg-surface-subtle"
                    to={`/developer-docs/${page.slug}`}
                  >
                    <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                      Step {index + 1}
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-text-primary">
                      {page.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {page.summary}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {developerDocGroups.map((group) => {
                const pages = developerDocPagesInOrder.filter(
                  (page) => page.groupId === group.id,
                );
                return (
                  <Surface key={group.id} className="grid gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                        {group.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {group.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pages.map((page) => (
                        <Link key={page.slug} to={`/developer-docs/${page.slug}`}>
                          <Badge variant="neutral">{page.title}</Badge>
                        </Link>
                      ))}
                    </div>
                  </Surface>
                );
              })}
            </div>
          </Surface>
        </main>
      </div>
    </div>
  );
}

export function DeveloperDocsPage() {
  const { slug } = useParams();
  const [filter, setFilter] = useState("");
  const page = slug ? developerDocPageBySlug.get(slug) : null;
  const headings = useMemo(
    () => (page ? extractHeadings(page.markdown, page.slug) : []),
    [page],
  );

  const currentIndex = page
    ? developerDocPagesInOrder.findIndex((candidate) => candidate.slug === page.slug)
    : -1;
  const previousPage =
    currentIndex > 0 ? developerDocPagesInOrder[currentIndex - 1] : null;
  const nextPage =
    currentIndex >= 0 && currentIndex < developerDocPagesInOrder.length - 1
      ? developerDocPagesInOrder[currentIndex + 1]
      : null;

  if (!slug) {
    return <DeveloperDocsIndex />;
  }

  if (!page) {
    return (
      <EmptyState
        title="Documentation page not found"
        description="The requested developer documentation route does not exist in this branch."
        action={
          <Link to="/developer-docs">
            <Button>Open docs index</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-4 md:px-6 md:pb-12 md:pt-6 lg:px-8">
      <DeveloperDocsToolbar filter={filter} onFilterChange={setFilter} />

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <DeveloperDocsSidebar
          filter={filter}
          headings={headings}
          pageGroupId={page.groupId}
          pageSlug={page.slug}
        />

        <main className="min-w-0 space-y-5">
          <PageHeader
            eyebrow="Developer Docs"
            title={page.title}
            description={page.summary}
            actions={
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">
                  {
                    developerDocGroups.find((group) => group.id === page.groupId)
                      ?.title
                  }
                </Badge>
                <Badge variant="default">{page.slug}</Badge>
              </div>
            }
          />

          <Surface className="grid gap-5">
            <MarkdownRenderer
              content={page.markdown}
              headingIdPrefix={page.slug}
              className="docs-markdown"
            />
          </Surface>

          <div className="grid gap-3 md:grid-cols-2">
            {previousPage ? (
              <Link
                className="border border-border bg-surface px-4 py-4 transition-colors hover:bg-surface-subtle"
                to={`/developer-docs/${previousPage.slug}`}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  Previous
                </div>
                <div className="mt-2 text-sm font-semibold text-text-primary">
                  {previousPage.title}
                </div>
              </Link>
            ) : (
              <div />
            )}
            {nextPage ? (
              <Link
                className="border border-border bg-surface px-4 py-4 text-left transition-colors hover:bg-surface-subtle"
                to={`/developer-docs/${nextPage.slug}`}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  Next
                </div>
                <div className="mt-2 text-sm font-semibold text-text-primary">
                  {nextPage.title}
                </div>
              </Link>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
