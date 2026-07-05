import { useParams } from "react-router-dom";
import { DevHealthCard } from "../components/dev-health-card";
import { EmptyState } from "../components/states";

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-950">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Foundation"
        title="A calm starting point for repository operations"
        description="This Phase 0 workspace focuses on the monorepo foundation: service health, organization navigation, and deliberate expansion paths for permissions, browsing, and native Mercurial integration."
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border border-border bg-surface p-5 shadow-panel">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Control plane", "FastAPI + SQLAlchemy + Alembic"],
              ["Developer UI", "React, Router, Query, Tailwind"],
              ["Local runtime", "PostgreSQL and Redis via Compose"],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-border bg-canvas p-4">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-500">
                  Ready
                </p>
                <h3 className="mt-2 text-base font-semibold text-ink-950">{title}</h3>
                <p className="mt-2 text-sm text-slate-500">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                Next vertical slices
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Repository creation flow with org-scoped slug validation</li>
                <li>Role-aware organization listings and membership policies</li>
                <li>Read-only repository overview backed by safe adapters</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-forge-600">
                Guardrails
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Authorization stays in the control plane, not the browser</li>
                <li>Repository paths stay server-derived and outside user input</li>
                <li>Mercurial remains the native source of truth for history</li>
              </ul>
            </div>
          </div>
        </section>

        {import.meta.env.DEV ? <DevHealthCard /> : null}
      </div>
    </div>
  );
}

export function LoginPage() {
  return (
    <div className="max-w-2xl">
      <SectionHeader
        eyebrow="Identity"
        title="Authentication is intentionally deferred"
        description="Phase 0 keeps the control-plane contract and routing in place without committing to a session, token, or SSO implementation too early."
      />
      <EmptyState
        title="Login flow not implemented yet"
        description="This route is reserved for upcoming browser-session and personal-access-token work."
      />
    </div>
  );
}

export function OrganizationsPage() {
  return (
    <div>
      <SectionHeader
        eyebrow="Organizations"
        title="Organization workspaces"
        description="The list route is wired and ready for future server-backed membership filtering, pagination, and role-aware actions."
      />
      <EmptyState
        title="No organizations loaded"
        description="Connect the organizations API when the first authenticated listing slice is ready."
      />
    </div>
  );
}

export function OrganizationDetailPage() {
  const { organizationSlug } = useParams();

  return (
    <div>
      <SectionHeader
        eyebrow="Organization"
        title={organizationSlug ?? "Organization"}
        description="This placeholder keeps the URL contract stable for future repository lists, member management, and audit activity."
      />
      <EmptyState
        title="Organization overview pending"
        description="The next slice can safely add repository cards, filters, and role-aware controls here."
      />
    </div>
  );
}

export function RepositoryDetailPage() {
  const { organizationSlug, repositorySlug } = useParams();

  return (
    <div>
      <SectionHeader
        eyebrow="Repository"
        title={`${organizationSlug ?? "organization"} / ${repositorySlug ?? "repository"}`}
        description="This route is reserved for the future repository browser, revision-aware file tree, changeset history, and clone guidance."
      />
      <EmptyState
        title="Repository browser pending"
        description="A future vertical slice will attach real repository metadata and navigation while preserving this URL shape."
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="max-w-2xl">
      <SectionHeader
        eyebrow="404"
        title="That route does not exist"
        description="RevForge keeps route state explicit so repository, organization, and revision URLs remain shareable and predictable."
      />
      <EmptyState
        title="Page not found"
        description="Use the sidebar to return to the foundation routes while the rest of the product is still being built."
      />
    </div>
  );
}

