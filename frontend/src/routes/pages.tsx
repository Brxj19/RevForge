import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { clsx } from "clsx";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAuth } from "../app/use-auth";
import { PageHeader } from "../components/layout/page-header";
import {
  ChangesetDetail as ChangesetDetailView,
  HistoryList,
} from "../components/changeset-browser";
import { CloneDialog } from "../components/clone-dialog";
import { CodeBrowser } from "../components/code-browser";
import { DevHealthCard } from "../components/dev-health-card";
import { MarkdownRenderer } from "../components/markdown";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { RepositoryGraphPage } from "./repository-graph";
import { FormField } from "../components/ui/form-field";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { DataTable } from "../components/ui/data-table";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Surface } from "../components/ui/surface";
import {
  addOrganizationMember,
  browseRepository,
  createOrganization,
  createRepository,
  deleteOrganizationMember,
  deleteRepositoryPermission,
  getChangeset,
  getChangesetDiff,
  getOrganization,
  getRepository,
  getRepositoryRefs,
  listChangesets,
  listOrganizationMembers,
  listOrganizations,
  listRepositories,
  listRepositoryPermissions,
  provisionRepository,
  setRepositoryPermission,
  updateOrganization,
  updateOrganizationMember,
  updateRepository,
  type ChangesetSummary,
  type OrganizationMember,
  type RepositoryBrowseResult,
  type RepositoryPermission,
  type RepositoryRef,
  type RepositorySummary,
} from "../lib/api";
import {
  buildCloneUrls,
  firstLine,
  formatAbsoluteTime,
  formatRelativeTime,
  formatShortTime,
  slugifyName,
} from "../lib/formatting";
import { repositorySearch } from "../lib/repository-routing";

function MessageBanner({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "info";
}) {
  return (
    <div
      className={clsx(
        "rounded-md border px-3 py-2 text-sm",
        tone === "info"
          ? "border-border-strong bg-surface-muted text-text-primary"
          : "border-transparent bg-danger-subtle text-danger",
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}

function Fieldset({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Surface className="grid gap-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      {children}
    </Surface>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Restoring your RevForge session." />;
  }

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`;
    return (
      <Navigate
        replace
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
      />
    );
  }

  return <>{children}</>;
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearError, errorMessage, isAuthenticated, login, register } =
    useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  const redirectTarget =
    new URLSearchParams(location.search).get("redirect") ?? "/";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setLocalError(null);

    if (!email.trim() || !password.trim()) {
      setLocalError("Complete the required fields before continuing.");
      return;
    }

    if (mode === "register" && !displayName.trim()) {
      setLocalError("Display name is required.");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "register") {
        await register({
          email,
          display_name: displayName,
          password,
        });
      } else {
        await login({ email, password });
      }
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "Unable to complete the request.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Surface className="order-2 lg:order-1">
          <PageHeader
            eyebrow={mode === "login" ? "Sign in" : "Register"}
            title={
              mode === "login"
                ? "Continue into RevForge"
                : "Create your RevForge account"
            }
            description={
              mode === "login"
                ? "Use your RevForge identity to reach organizations, repositories, and Mercurial transport workflows."
                : "Local credentials support self-hosted deployments without relying on third-party identity providers."
            }
          />
          <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
            <FormField label="Email">
              <Input
                aria-label="Email"
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            {mode === "register" ? (
              <FormField
                label="Display name"
                hint="Shown in repository history, activity, and reviews."
              >
                <Input
                  aria-label="Display name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </FormField>
            ) : null}
            <FormField
              label="Password"
              hint={
                mode === "register"
                  ? "Use a strong password. Registration remains admin-controlled when deployments disable open signup."
                  : undefined
              }
            >
              <Input
                aria-label="Password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            {localError ? <MessageBanner message={localError} /> : null}
            {errorMessage ? <MessageBanner message={errorMessage} /> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button loading={submitting} type="submit">
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>
              <Link
                className="text-sm text-text-secondary hover:text-text-primary"
                to={mode === "login" ? "/register" : "/login"}
              >
                {mode === "login"
                  ? "Need an account? Register"
                  : "Already registered? Sign in"}
              </Link>
            </div>
          </form>
        </Surface>

        <Surface className="order-1 lg:order-2">
          <PageHeader
            eyebrow="Trust model"
            title="Calm operational control for Mercurial-native teams"
            description="RevForge keeps repository identity, permissions, clone access, and revision history explicit on every screen."
          />
          <div className="mt-5 grid gap-3">
            {[
              "Repository paths, revisions, and filters remain URL-addressable.",
              "Control-plane changes stay behind authenticated sessions with CSRF protection.",
              "Clone guidance never exposes personal access tokens in URLs or browser history.",
              "Dangerous settings require explicit confirmation instead of accidental clicks.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-md border border-border bg-canvas px-4 py-3 text-sm text-text-secondary"
              >
                {item}
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}

function sortRepositoriesByRecentActivity<T extends { updated_at: string }>(
  items: T[],
) {
  return [...items].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() -
      new Date(left.updated_at).getTime(),
  );
}

type DashboardRepository = RepositorySummary & {
  organization_slug: string;
  organization_name: string;
};

function visibilityVariant(visibility: RepositorySummary["visibility"]) {
  switch (visibility) {
    case "public":
      return "success";
    case "internal":
      return "warning";
    default:
      return "default";
  }
}

function provisioningVariant(
  state: RepositorySummary["provisioning_state"],
): "warning" | "info" | "success" | "danger" {
  switch (state) {
    case "provisioning":
      return "info";
    case "ready":
      return "success";
    case "failed":
      return "danger";
    default:
      return "warning";
  }
}

function repositoryQuickActions(
  organizationSlug: string,
  repository: RepositorySummary,
) {
  const basePath = `/organizations/${organizationSlug}/repositories/${repository.slug}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        className="text-sm text-accent hover:underline"
        to={`${basePath}/code`}
      >
        Code
      </Link>
      <Link className="text-sm text-accent hover:underline" to={basePath}>
        Overview
      </Link>
      {repository.can_manage ? (
        <Link
          className="text-sm text-accent hover:underline"
          to={`${basePath}/settings`}
        >
          Settings
        </Link>
      ) : null}
    </div>
  );
}

export function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
    enabled: isAuthenticated,
  });

  const repositoryQueries = useQueries({
    queries: (organizationsQuery.data ?? []).map((organization) => ({
      queryKey: ["organization-repositories", organization.slug],
      queryFn: () => listRepositories(organization.slug, true),
      enabled: isAuthenticated,
    })),
  });

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Developer forge"
          title="Mercurial hosting with calm operational control"
          description="Browse repository history, inspect revisions, and manage clone access without dashboard noise or ambiguous permissions."
          actions={
            <>
              <Link to="/login">
                <Button variant="secondary">Sign in</Button>
              </Link>
              <Link to="/register">
                <Button>Register</Button>
              </Link>
            </>
          }
        />
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Surface>
            <h2 className="text-base font-semibold text-text-primary">
              What RevForge is optimized for
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                {
                  title: "Repository browsing first",
                  detail:
                    "Code, history, changesets, and clone flows stay denser and clearer than generic project dashboards.",
                },
                {
                  title: "Mercurial vocabulary",
                  detail:
                    "Changesets, revisions, branches, bookmarks, tags, clone, pull, and push remain first-class concepts.",
                },
                {
                  title: "Safe operations",
                  detail:
                    "Provisioning, permissions, and destructive actions include explicit states and confirmations.",
                },
                {
                  title: "Traceable activity",
                  detail:
                    "Audit, access, and repository changes are designed for self-hosted teams that need calm operational trust.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-md border border-border bg-canvas p-4"
                >
                  <h3 className="text-sm font-semibold text-text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </Surface>
          {import.meta.env.DEV ? <DevHealthCard /> : null}
        </div>
      </div>
    );
  }

  const repositories: DashboardRepository[] = sortRepositoriesByRecentActivity(
    repositoryQueries.flatMap((query, index) => {
      const organization = organizationsQuery.data?.[index];
      return (query.data ?? []).map((repository) => ({
        ...repository,
        organization_slug: organization?.slug ?? "",
        organization_name:
          organization?.display_name ?? organization?.slug ?? "",
      }));
    }),
  );
  const continueWorking = repositories.slice(0, 6);
  const needsAttention = repositories.filter(
    (repository) =>
      repository.provisioning_state === "failed" ||
      repository.provisioning_state === "unprovisioned" ||
      repository.archived_at !== null,
  );
  const loadingRepositories =
    organizationsQuery.isLoading ||
    repositoryQueries.some((query) => query.isLoading);
  const repositoryError = repositoryQueries.find(
    (query) => query.isError,
  )?.error;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={`Continue working${user ? `, ${user.display_name}` : ""}`}
        description="Open the next repository quickly, surface operational issues, and keep clone and history actions within reach."
        actions={
          <Link to="/repositories">
            <Button>Browse repositories</Button>
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <Fieldset
          title="Continue working"
          description="Recently updated repositories across your organizations."
        >
          {loadingRepositories ? (
            <LoadingState label="Loading repositories." />
          ) : repositoryError ? (
            <ErrorState
              title="Repository list unavailable"
              description={
                repositoryError instanceof Error
                  ? repositoryError.message
                  : "Unable to load repositories."
              }
            />
          ) : continueWorking.length > 0 ? (
            <DataTable
              columns={[
                {
                  key: "repository",
                  header: "Repository",
                  render: (repository) => (
                    <div className="min-w-0">
                      <Link
                        className="font-medium text-text-primary hover:text-accent"
                        to={`/organizations/${repository.organization_slug}/repositories/${repository.slug}`}
                      >
                        {repository.display_name}
                      </Link>
                      <div className="mt-1 text-xs text-text-muted">
                        {repository.description ?? "No description"}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "state",
                  header: "State",
                  render: (repository) => (
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={visibilityVariant(repository.visibility)}>
                        {repository.visibility}
                      </Badge>
                      <Badge
                        variant={provisioningVariant(
                          repository.provisioning_state,
                        )}
                      >
                        {repository.provisioning_state}
                      </Badge>
                    </div>
                  ),
                },
                {
                  key: "updated",
                  header: "Updated",
                  render: (repository) => (
                    <span title={formatAbsoluteTime(repository.updated_at)}>
                      {formatRelativeTime(repository.updated_at)}
                    </span>
                  ),
                },
                {
                  key: "role",
                  header: "Role",
                  render: (repository) => repository.viewer_role ?? "metadata",
                },
              ]}
              data={continueWorking}
              keyFn={(repository) => repository.id}
            />
          ) : (
            <EmptyState
              title="No repositories yet"
              description="Create your first organization and repository, then provision Mercurial storage."
              action={
                <Link to="/organizations/new">
                  <Button>Create organization</Button>
                </Link>
              }
            />
          )}
        </Fieldset>

        <div className="grid gap-4">
          <Fieldset
            title="Needs attention"
            description="Operational conditions that could block clone, pull, push, or browser workflows."
          >
            {needsAttention.length > 0 ? (
              <div className="grid gap-3">
                {needsAttention.slice(0, 5).map((repository) => (
                  <div
                    key={repository.id}
                    className="rounded-md border border-border bg-canvas px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">
                        {repository.display_name}
                      </span>
                      <Badge
                        variant={provisioningVariant(
                          repository.provisioning_state,
                        )}
                      >
                        {repository.provisioning_state}
                      </Badge>
                      {repository.archived_at ? (
                        <Badge variant="neutral">Archived</Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">
                      {repository.provisioning_state === "failed"
                        ? "Repository storage failed to provision. Review repository settings and retry once the backend request is healthy."
                        : repository.provisioning_state === "unprovisioned"
                          ? "Repository metadata exists but Mercurial storage is not provisioned yet."
                          : "This repository is archived and read-only."}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No urgent issues"
                description="Provisioning, archive state, and repository readiness look healthy from the metadata visible in this session."
              />
            )}
          </Fieldset>

          <Fieldset
            title="Quick actions"
            description="The most common trust and access tasks for developer workstations."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { label: "Repositories", to: "/repositories" },
                { label: "Add SSH key", to: "/settings?tab=ssh-keys" },
                { label: "Create token", to: "/settings?tab=tokens" },
                { label: "View audit", to: "/activity" },
              ].map((action) => (
                <Link
                  key={action.label}
                  className="bg-surface-subtle px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                  to={action.to}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </Fieldset>
        </div>
      </div>

      <Fieldset
        title="Repositories"
        description="Every repository you can currently discover through organization membership."
      >
        {loadingRepositories ? (
          <LoadingState label="Loading repositories." />
        ) : (
          <DataTable
            columns={[
              {
                key: "name",
                header: "Repository",
                render: (repository) => (
                  <div className="min-w-0">
                    <Link
                      className="font-medium text-text-primary hover:text-accent"
                      to={`/organizations/${repository.organization_slug}/repositories/${repository.slug}`}
                    >
                      {repository.display_name}
                    </Link>
                    <div className="mt-1 font-mono text-[11px] text-text-muted">
                      {repository.slug}
                    </div>
                  </div>
                ),
              },
              {
                key: "visibility",
                header: "Visibility",
                render: (repository) => (
                  <Badge variant={visibilityVariant(repository.visibility)}>
                    {repository.visibility}
                  </Badge>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (repository) => (
                  <Badge
                    variant={provisioningVariant(repository.provisioning_state)}
                  >
                    {repository.provisioning_state}
                  </Badge>
                ),
              },
              {
                key: "updated",
                header: "Updated",
                render: (repository) => (
                  <span title={formatAbsoluteTime(repository.updated_at)}>
                    {formatShortTime(repository.updated_at)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                render: (repository) =>
                  repositoryQuickActions(
                    repository.organization_slug,
                    repository,
                  ),
              },
            ]}
            data={repositories.slice(0, 12)}
            keyFn={(repository) => repository.id}
          />
        )}
      </Fieldset>
    </div>
  );
}

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}

export function OrganizationsPage() {
  return (
    <ProtectedRoute>
      <OrganizationsContent />
    </ProtectedRoute>
  );
}

function OrganizationsContent() {
  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  if (organizationsQuery.data?.length === 1) {
    return (
      <Navigate
        to={`/organizations/${organizationsQuery.data[0].slug}`}
        replace
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizations"
        title="Organization workspaces"
        description="Keep repository discovery dense and explicit: members, roles, and repository catalogs stay close together without turning the page into a dashboard."
        actions={
          <Link to="/organizations/new">
            <Button>New organization</Button>
          </Link>
        }
      />
      <div className="grid gap-4">
        <Fieldset
          title="Your organizations"
          description="Open organization repository tables, membership, and settings."
        >
          {organizationsQuery.isLoading ? (
            <LoadingState label="Loading organizations." />
          ) : organizationsQuery.isError ? (
            <ErrorState
              title="Organizations unavailable"
              description={
                organizationsQuery.error instanceof Error
                  ? organizationsQuery.error.message
                  : "Unable to load organizations."
              }
            />
          ) : organizationsQuery.data && organizationsQuery.data.length > 0 ? (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Organization",
                  render: (organization) => (
                    <div className="min-w-0">
                      <Link
                        className="font-medium text-text-primary hover:text-accent"
                        to={`/organizations/${organization.slug}`}
                      >
                        {organization.display_name}
                      </Link>
                      <div className="mt-1 font-mono text-[11px] text-text-muted">
                        {organization.slug}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "description",
                  header: "Description",
                  render: (organization) => (
                    <span className="text-sm text-text-secondary">
                      {organization.description ?? "No description"}
                    </span>
                  ),
                },
                {
                  key: "role",
                  header: "Role",
                  render: (organization) => organization.viewer_role,
                },
                {
                  key: "updated",
                  header: "Updated",
                  render: (organization) => (
                    <span title={formatAbsoluteTime(organization.updated_at)}>
                      {formatRelativeTime(organization.updated_at)}
                    </span>
                  ),
                },
              ]}
              data={organizationsQuery.data}
              keyFn={(organization) => organization.id}
            />
          ) : (
            <EmptyState
              title="No organizations yet"
              description="Create your first organization to start managing members and repository metadata."
            />
          )}
        </Fieldset>
      </div>
    </div>
  );
}

export function CreateOrganizationPage() {
  return (
    <ProtectedRoute>
      <CreateOrganizationContent />
    </ProtectedRoute>
  );
}

function CreateOrganizationContent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const [formState, setFormState] = useState({
    slug: "",
    display_name: "",
    description: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createOrganization(
        {
          slug: formState.slug,
          display_name: formState.display_name,
          description: formState.description || null,
        },
        csrfToken,
      ),
    onSuccess: async (organization) => {
      setCreateError(null);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      navigate(`/organizations/${organization.slug}`);
    },
    onError: (error) => {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Unable to create the organization.",
      );
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizations"
        title="Create organization"
        description="Create the single organization that will hold your repositories, members, and settings."
        actions={
          <Link to="/organizations">
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />
      <Fieldset
        title="Organization identity"
        description="The slug becomes part of repository URLs, so choose something stable."
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createMutation.mutateAsync();
          }}
        >
          <FormField label="Display name">
            <Input
              aria-label="Organization display name"
              value={formState.display_name}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  display_name: event.target.value,
                  slug: slugTouched
                    ? current.slug
                    : slugifyName(event.target.value),
                }))
              }
            />
          </FormField>
          <FormField label="Slug" hint="Keep it short, URL-safe, and stable.">
            <Input
              aria-label="Organization slug"
              value={formState.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setFormState((current) => ({
                  ...current,
                  slug: event.target.value,
                }));
              }}
            />
          </FormField>
          <FormField label="Description">
            <textarea
              aria-label="Organization description"
              className="min-h-24 w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={formState.description}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </FormField>
          {createError ? <MessageBanner message={createError} /> : null}
          <div className="flex gap-2">
            <Button loading={createMutation.isPending} type="submit">
              Create organization
            </Button>
            <Link to="/organizations">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Fieldset>
    </div>
  );
}

export function OrganizationRepositoriesPage() {
  return (
    <ProtectedRoute>
      <OrganizationRepositoriesContent />
    </ProtectedRoute>
  );
}

function OrganizationRepositoriesContent() {
  const { organizationSlug = "" } = useParams();
  const organizationQuery = useQuery({
    queryKey: ["organization", organizationSlug],
    queryFn: () => getOrganization(organizationSlug),
  });
  const repositoriesQuery = useQuery({
    queryKey: ["organization-repositories", organizationSlug, true],
    queryFn: () => listRepositories(organizationSlug, true),
    enabled: organizationQuery.isSuccess,
  });
  const [repositorySearchText, setRepositorySearchText] = useState("");
  const [repositoryFilter, setRepositoryFilter] = useState("all");

  const repositoryChangesetQueries = useQueries({
    queries: (repositoriesQuery.data ?? []).map((repository) => ({
      queryKey: ["repository-latest", organizationSlug, repository.slug],
      queryFn: () => listChangesets(organizationSlug, repository.slug),
      enabled: repository.is_browsable,
    })),
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading repositories." />;
  }

  if (organizationQuery.isError || !organizationQuery.data) {
    return (
      <ErrorState
        title="Repositories unavailable"
        description={
          organizationQuery.error instanceof Error
            ? organizationQuery.error.message
            : "Unable to load the organization."
        }
      />
    );
  }

  const organization = organizationQuery.data;
  const repositories = repositoriesQuery.data ?? [];
  const filteredRepositories = organizationRepoFilter(
    repositories,
    repositorySearchText,
    repositoryFilter,
  );

  function latestChangesetFor(repository: RepositorySummary) {
    const index = repositories.findIndex((item) => item.id === repository.id);
    const query = index >= 0 ? repositoryChangesetQueries[index] : undefined;
    return query?.data?.changesets[0];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Repositories"
        title={`${organization.display_name} repositories`}
        description="A dedicated repository catalog with denser scanning and direct creation flow."
        actions={
          <>
            {organization.can_manage ? (
              <Link to={`/organizations/${organization.slug}/repositories/new`}>
                <Button>New repository</Button>
              </Link>
            ) : null}
            <Link to={`/organizations/${organization.slug}/settings`}>
              <Button variant="secondary">Settings</Button>
            </Link>
          </>
        }
      />
      <Fieldset
        title="Repositories"
        description="Browse every repository in this organization with status, access, and latest changeset context."
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="Search repositories"
              placeholder="Search repositories"
              value={repositorySearchText}
              onChange={(event) => setRepositorySearchText(event.target.value)}
            />
          </div>
          <div className="w-full lg:w-56">
            <Select
              aria-label="Filter repositories"
              value={repositoryFilter}
              onChange={(event) => setRepositoryFilter(event.target.value)}
            >
              <option value="all">All repositories</option>
              <option value="writable">Writable</option>
              <option value="admin">Admin</option>
              <option value="archived">Archived</option>
              <option value="unprovisioned">Unprovisioned</option>
            </Select>
          </div>
        </div>
        {repositoriesQuery.isLoading ? (
          <LoadingState label="Loading repositories." />
        ) : repositoriesQuery.isError ? (
          <ErrorState
            title="Repository catalog unavailable"
            description={
              repositoriesQuery.error instanceof Error
                ? repositoriesQuery.error.message
                : "Unable to load repositories."
            }
          />
        ) : filteredRepositories.length > 0 ? (
          <DataTable
            columns={[
              {
                key: "name",
                header: "Repository",
                render: (repository) => (
                  <div className="min-w-0">
                    <Link
                      className="font-medium text-text-primary hover:text-accent"
                      to={`/organizations/${organization.slug}/repositories/${repository.slug}`}
                    >
                      {repository.display_name}
                    </Link>
                    <div className="mt-1 text-xs text-text-muted">
                      {repository.description ?? "No description"}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-text-muted">
                      {repository.slug}
                    </div>
                  </div>
                ),
              },
              {
                key: "visibility",
                header: "Visibility",
                render: (repository) => (
                  <Badge variant={visibilityVariant(repository.visibility)}>
                    {repository.visibility}
                  </Badge>
                ),
              },
              {
                key: "state",
                header: "State",
                render: (repository) => (
                  <Badge
                    variant={provisioningVariant(repository.provisioning_state)}
                  >
                    {repository.provisioning_state}
                  </Badge>
                ),
              },
              {
                key: "changeset",
                header: "Latest changeset",
                render: (repository) => {
                  const latest = latestChangesetFor(repository);
                  return latest ? (
                    <div className="text-xs">
                      <div className="font-mono text-text-primary">
                        {latest.short_node}
                      </div>
                      <div className="text-text-muted">
                        {firstLine(latest.message)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">
                      {repository.is_browsable ? "Loading…" : "Not available"}
                    </span>
                  );
                },
              },
              {
                key: "updated",
                header: "Updated",
                render: (repository) => (
                  <span title={formatAbsoluteTime(repository.updated_at)}>
                    {formatRelativeTime(repository.updated_at)}
                  </span>
                ),
              },
              {
                key: "role",
                header: "Your role",
                render: (repository) => repository.viewer_role ?? "metadata",
              },
              {
                key: "actions",
                header: "Actions",
                render: (repository) =>
                  repositoryQuickActions(organization.slug, repository),
              },
            ]}
            data={filteredRepositories}
            keyFn={(repository) => repository.id}
          />
        ) : (
          <EmptyState
            title="No repositories match"
            description="Adjust the search or filter to surface repositories in this organization."
          />
        )}
      </Fieldset>
    </div>
  );
}

export function CreateOrganizationMemberPage() {
  return (
    <ProtectedRoute>
      <CreateOrganizationMemberContent />
    </ProtectedRoute>
  );
}

function CreateOrganizationMemberContent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { organizationSlug = "" } = useParams();
  const organizationQuery = useQuery({
    queryKey: ["organization", organizationSlug],
    queryFn: () => getOrganization(organizationSlug),
  });
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"owner" | "admin" | "member">(
    "member",
  );

  const addMemberMutation = useMutation({
    mutationFn: () =>
      addOrganizationMember(
        organizationSlug,
        { email: memberEmail, role: memberRole },
        csrfToken,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationSlug],
      });
      navigate(`/organizations/${organizationSlug}`);
    },
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization." />;
  }

  if (organizationQuery.isError || !organizationQuery.data) {
    return (
      <ErrorState
        title="Organization unavailable"
        description={
          organizationQuery.error instanceof Error
            ? organizationQuery.error.message
            : "Unable to load the organization."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization"
        title={`Add member to ${organizationQuery.data.display_name}`}
        description="Invite an existing account into this organization with an explicit role."
        actions={
          <Link to={`/organizations/${organizationSlug}`}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />
      <Fieldset
        title="Member access"
        description="Choose who to add and what role they should receive."
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void addMemberMutation.mutateAsync();
          }}
        >
          <FormField label="User email">
            <Input
              aria-label="Member email"
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Role">
            <Select
              aria-label="Member role"
              value={memberRole}
              onChange={(event) =>
                setMemberRole(
                  event.target.value as "owner" | "admin" | "member",
                )
              }
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </Select>
          </FormField>
          {addMemberMutation.isError ? (
            <MessageBanner
              message={
                addMemberMutation.error instanceof Error
                  ? addMemberMutation.error.message
                  : "Unable to add the member."
              }
            />
          ) : null}
          <div className="flex gap-2">
            <Button loading={addMemberMutation.isPending} type="submit">
              Add member
            </Button>
            <Link to={`/organizations/${organizationSlug}`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Fieldset>
    </div>
  );
}

export function CreateRepositoryPage() {
  return (
    <ProtectedRoute>
      <CreateRepositoryContent />
    </ProtectedRoute>
  );
}

export function RepositoriesPage() {
  return (
    <ProtectedRoute>
      <RepositoriesContent />
    </ProtectedRoute>
  );
}

function RepositoriesContent() {
  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  if (organizationsQuery.isLoading) {
    return <LoadingState label="Loading repositories." />;
  }

  if (organizationsQuery.isError) {
    return (
      <ErrorState
        title="Repositories unavailable"
        description={
          organizationsQuery.error instanceof Error
            ? organizationsQuery.error.message
            : "Unable to load organizations."
        }
      />
    );
  }

  if ((organizationsQuery.data ?? []).length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Repositories"
          title="No repositories yet"
          description="Create your organization first so repository hosting can be configured."
          actions={
            <Link to="/organizations/new">
              <Button>Create organization</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <Navigate
      to={`/organizations/${organizationsQuery.data?.[0].slug}/repositories`}
      replace
    />
  );
}

function CreateRepositoryContent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { organizationSlug = "" } = useParams();
  const organizationQuery = useQuery({
    queryKey: ["organization", organizationSlug],
    queryFn: () => getOrganization(organizationSlug),
  });
  const [repoState, setRepoState] = useState({
    slug: "",
    display_name: "",
    description: "",
    visibility: "private" as "public" | "internal" | "private",
  });
  const [slugTouched, setSlugTouched] = useState(false);

  const createRepoMutation = useMutation({
    mutationFn: () => createRepository(organizationSlug, repoState, csrfToken),
    onSuccess: async (repository) => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-repositories", organizationSlug],
      });
      navigate(
        `/organizations/${organizationSlug}/repositories/${repository.slug}`,
      );
    },
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization." />;
  }

  if (organizationQuery.isError || !organizationQuery.data) {
    return (
      <ErrorState
        title="Organization unavailable"
        description={
          organizationQuery.error instanceof Error
            ? organizationQuery.error.message
            : "Unable to load the organization."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Repositories"
        title={`Create repository in ${organizationQuery.data.display_name}`}
        description="Create repository metadata first, then provision Mercurial storage when you are ready."
        actions={
          <Link to={`/organizations/${organizationSlug}/repositories`}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />
      <Fieldset
        title="Repository identity"
        description="Choose the stable repository metadata that will appear throughout RevForge."
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createRepoMutation.mutateAsync();
          }}
        >
          <FormField label="Display name">
            <Input
              aria-label="Repository display name"
              value={repoState.display_name}
              onChange={(event) =>
                setRepoState((current) => ({
                  ...current,
                  display_name: event.target.value,
                  slug: slugTouched
                    ? current.slug
                    : slugifyName(event.target.value),
                }))
              }
            />
          </FormField>
          <FormField label="Slug">
            <Input
              aria-label="Repository slug"
              value={repoState.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setRepoState((current) => ({
                  ...current,
                  slug: event.target.value,
                }));
              }}
            />
          </FormField>
          <FormField label="Visibility">
            <Select
              aria-label="Repository visibility"
              value={repoState.visibility}
              onChange={(event) =>
                setRepoState((current) => ({
                  ...current,
                  visibility: event.target.value as
                    "public" | "internal" | "private",
                }))
              }
            >
              <option value="private">private</option>
              <option value="internal">internal</option>
              <option value="public">public</option>
            </Select>
          </FormField>
          <FormField label="Description">
            <textarea
              aria-label="Repository description"
              className="min-h-24 w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              value={repoState.description}
              onChange={(event) =>
                setRepoState((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </FormField>
          {createRepoMutation.isError ? (
            <MessageBanner
              message={
                createRepoMutation.error instanceof Error
                  ? createRepoMutation.error.message
                  : "Unable to create the repository."
              }
            />
          ) : null}
          <div className="flex gap-2">
            <Button loading={createRepoMutation.isPending} type="submit">
              Create repository
            </Button>
            <Link to={`/organizations/${organizationSlug}/repositories`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Fieldset>
    </div>
  );
}

function useOrganizationRouteData() {
  const { organizationSlug = "" } = useParams();
  const organizationQuery = useQuery({
    queryKey: ["organization", organizationSlug],
    queryFn: () => getOrganization(organizationSlug),
  });
  const membersQuery = useQuery({
    queryKey: ["organization-members", organizationSlug],
    queryFn: () => listOrganizationMembers(organizationSlug),
    enabled: organizationQuery.isSuccess,
  });
  const repositoriesQuery = useQuery({
    queryKey: ["organization-repositories", organizationSlug, true],
    queryFn: () => listRepositories(organizationSlug, true),
  });

  return {
    membersQuery,
    organizationQuery,
    organizationSlug,
    repositoriesQuery,
  };
}

function organizationRepoFilter(
  repositories: RepositorySummary[],
  search: string,
  filter: string,
) {
  return repositories.filter((repository) => {
    const matchesText =
      search.trim().length === 0 ||
      repository.display_name.toLowerCase().includes(search.toLowerCase()) ||
      repository.slug.toLowerCase().includes(search.toLowerCase()) ||
      (repository.description ?? "")
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "writable" &&
        (repository.viewer_role === "write" ||
          repository.viewer_role === "admin")) ||
      (filter === "admin" && repository.viewer_role === "admin") ||
      (filter === "archived" && repository.archived_at !== null) ||
      (filter === "unprovisioned" && repository.provisioning_state !== "ready");

    return matchesText && matchesFilter;
  });
}

export function OrganizationDetailPage() {
  return (
    <ProtectedRoute>
      <OrganizationDetailContent />
    </ProtectedRoute>
  );
}

function OrganizationDetailContent() {
  const {
    membersQuery,
    organizationQuery,
    organizationSlug,
    repositoriesQuery,
  } = useOrganizationRouteData();
  const [repositorySearchText, setRepositorySearchText] = useState("");
  const [repositoryFilter, setRepositoryFilter] = useState("all");

  const repositoryChangesetQueries = useQueries({
    queries: (repositoriesQuery.data ?? []).map((repository) => ({
      queryKey: ["repository-latest", organizationSlug, repository.slug],
      queryFn: () => listChangesets(organizationSlug, repository.slug),
      enabled: repository.is_browsable,
    })),
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization overview." />;
  }

  if (organizationQuery.isError || !organizationQuery.data) {
    return (
      <ErrorState
        title="Organization unavailable"
        description={
          organizationQuery.error instanceof Error
            ? organizationQuery.error.message
            : "Unable to load the organization."
        }
      />
    );
  }

  const organization = organizationQuery.data;
  const repositories = repositoriesQuery.data ?? [];
  const filteredRepositories = organizationRepoFilter(
    repositories,
    repositorySearchText,
    repositoryFilter,
  );

  function latestChangesetFor(repository: RepositorySummary) {
    const index = repositories.findIndex((item) => item.id === repository.id);
    const query = index >= 0 ? repositoryChangesetQueries[index] : undefined;
    return query?.data?.changesets[0];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization"
        title={organization.display_name}
        description={
          organization.description ??
          "Browse repositories, understand your role, and manage organization members without burying repository work behind cards."
        }
        actions={
          organization.can_manage ? (
            <>
              <Link to={`/organizations/${organization.slug}/members/new`}>
                <Button>Add member</Button>
              </Link>
              <Link to={`/organizations/${organization.slug}/repositories/new`}>
                <Button>New repository</Button>
              </Link>
              <Link to={`/organizations/${organization.slug}/settings`}>
                <Button variant="secondary">Settings</Button>
              </Link>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr] xl:items-start">
        <Fieldset
          title="Repositories"
          description="Searchable repository table with visibility, provisioning state, latest changeset, and your effective role."
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <Input
                aria-label="Search repositories"
                placeholder="Search repositories"
                value={repositorySearchText}
                onChange={(event) =>
                  setRepositorySearchText(event.target.value)
                }
              />
            </div>
            <div className="w-full lg:w-56">
              <Select
                aria-label="Filter repositories"
                value={repositoryFilter}
                onChange={(event) => setRepositoryFilter(event.target.value)}
              >
                <option value="all">All repositories</option>
                <option value="writable">Writable</option>
                <option value="admin">Admin</option>
                <option value="archived">Archived</option>
                <option value="unprovisioned">Unprovisioned</option>
              </Select>
            </div>
          </div>
          {repositoriesQuery.isLoading ? (
            <LoadingState label="Loading repositories." />
          ) : repositoriesQuery.isError ? (
            <ErrorState
              title="Repository catalog unavailable"
              description={
                repositoriesQuery.error instanceof Error
                  ? repositoriesQuery.error.message
                  : "Unable to load repositories."
              }
            />
          ) : filteredRepositories.length > 0 ? (
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Repository",
                  render: (repository) => (
                    <div className="min-w-0">
                      <Link
                        className="font-medium text-text-primary hover:text-accent"
                        to={`/organizations/${organization.slug}/repositories/${repository.slug}`}
                      >
                        {repository.display_name}
                      </Link>
                      <div className="mt-1 text-xs text-text-muted">
                        {repository.description ?? "No description"}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-text-muted">
                        {repository.slug}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "visibility",
                  header: "Visibility",
                  render: (repository) => (
                    <Badge variant={visibilityVariant(repository.visibility)}>
                      {repository.visibility}
                    </Badge>
                  ),
                },
                {
                  key: "state",
                  header: "State",
                  render: (repository) => (
                    <Badge
                      variant={provisioningVariant(
                        repository.provisioning_state,
                      )}
                    >
                      {repository.provisioning_state}
                    </Badge>
                  ),
                },
                {
                  key: "changeset",
                  header: "Latest changeset",
                  render: (repository) => {
                    const latest = latestChangesetFor(repository);
                    return latest ? (
                      <div className="text-xs">
                        <div className="font-mono text-text-primary">
                          {latest.short_node}
                        </div>
                        <div className="text-text-muted">
                          {firstLine(latest.message)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">
                        {repository.is_browsable ? "Loading…" : "Not available"}
                      </span>
                    );
                  },
                },
                {
                  key: "updated",
                  header: "Updated",
                  render: (repository) => (
                    <span title={formatAbsoluteTime(repository.updated_at)}>
                      {formatRelativeTime(repository.updated_at)}
                    </span>
                  ),
                },
                {
                  key: "role",
                  header: "Your role",
                  render: (repository) => repository.viewer_role ?? "metadata",
                },
                {
                  key: "actions",
                  header: "Actions",
                  render: (repository) =>
                    repositoryQuickActions(organization.slug, repository),
                },
              ]}
              data={filteredRepositories}
              keyFn={(repository) => repository.id}
            />
          ) : (
            <EmptyState
              title="No repositories match"
              description="Adjust the search or filter to surface repositories in this organization."
            />
          )}
        </Fieldset>

        <div className="grid gap-4">
          <Fieldset
            title="Members"
            description="Compact organization membership summary without taking focus away from repository discovery."
          >
            {membersQuery.isLoading ? (
              <LoadingState label="Loading members." />
            ) : membersQuery.data ? (
              <>
                <div className="rounded-md border border-border bg-canvas px-4 py-3">
                  <div className="text-sm font-medium text-text-primary">
                    {membersQuery.data.length} total members
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    Owners:{" "}
                    {
                      membersQuery.data.filter(
                        (member) => member.role === "owner",
                      ).length
                    }{" "}
                    · Admins:{" "}
                    {
                      membersQuery.data.filter(
                        (member) => member.role === "admin",
                      ).length
                    }{" "}
                    · Members:{" "}
                    {
                      membersQuery.data.filter(
                        (member) => member.role === "member",
                      ).length
                    }
                  </div>
                </div>
                <div className="grid gap-2">
                  {membersQuery.data.slice(0, 6).map((member) => (
                    <div
                      key={member.id}
                      className="rounded-md border border-border bg-canvas px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-primary">
                            {member.user_display_name}
                          </div>
                          <div className="truncate text-xs text-text-muted">
                            {member.user_email}
                          </div>
                        </div>
                        <Badge variant="default">{member.role}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </Fieldset>
        </div>
      </div>
    </div>
  );
}

export function OrganizationSettingsPage() {
  return (
    <ProtectedRoute>
      <OrganizationSettingsContent />
    </ProtectedRoute>
  );
}

function OrganizationSettingsContent() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { membersQuery, organizationQuery, organizationSlug } =
    useOrganizationRouteData();
  const [removeTarget, setRemoveTarget] = useState<OrganizationMember | null>(
    null,
  );

  const updateMutation = useMutation({
    mutationFn: (payload: {
      display_name?: string;
      description?: string | null;
    }) => updateOrganization(organizationSlug, payload, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization", organizationSlug],
      });
    },
  });

  const memberRoleMutation = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: "owner" | "admin" | "member";
    }) =>
      updateOrganizationMember(organizationSlug, memberId, { role }, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationSlug],
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      deleteOrganizationMember(organizationSlug, memberId, csrfToken),
    onSuccess: async () => {
      setRemoveTarget(null);
      await queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationSlug],
      });
    },
  });

  if (organizationQuery.isLoading) {
    return <LoadingState label="Loading organization settings." />;
  }

  if (organizationQuery.isError || !organizationQuery.data) {
    return (
      <ErrorState
        title="Organization settings unavailable"
        description={
          organizationQuery.error instanceof Error
            ? organizationQuery.error.message
            : "Unable to load organization settings."
        }
      />
    );
  }

  const organization = organizationQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization settings"
        title={organization.display_name}
        description="Separate metadata updates from role changes so repository discovery remains distinct from administrative work."
      />
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Fieldset
          title="General"
          description="Display name and description affect organization identity across repository routes."
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void updateMutation.mutateAsync({
                display_name: String(form.get("display_name") ?? ""),
                description: String(form.get("description") ?? ""),
              });
            }}
          >
            <FormField label="Display name">
              <Input
                aria-label="Display name"
                defaultValue={organization.display_name}
                name="display_name"
              />
            </FormField>
            <FormField label="Description">
              <textarea
                aria-label="Description"
                className="min-h-24 w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                defaultValue={organization.description ?? ""}
                name="description"
              />
            </FormField>
            {updateMutation.isError ? (
              <MessageBanner
                message={
                  updateMutation.error instanceof Error
                    ? updateMutation.error.message
                    : "Unable to save organization settings."
                }
              />
            ) : null}
            {updateMutation.isSuccess ? (
              <MessageBanner
                message="Organization settings saved."
                tone="info"
              />
            ) : null}
            <Button
              disabled={!organization.can_manage}
              loading={updateMutation.isPending}
              type="submit"
            >
              Save organization settings
            </Button>
          </form>
        </Fieldset>

        <Fieldset
          title="Members and roles"
          description="Role changes affect repository discovery and administration immediately."
        >
          {membersQuery.isLoading ? (
            <LoadingState label="Loading members." />
          ) : membersQuery.data ? (
            <div className="grid gap-3">
              {membersQuery.data.map((member) => (
                <form
                  key={member.id}
                  className="rounded-md border border-border bg-canvas p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void memberRoleMutation.mutateAsync({
                      memberId: member.id,
                      role: String(form.get("role")) as
                        "owner" | "admin" | "member",
                    });
                  }}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {member.user_display_name}
                      </div>
                      <div className="truncate text-xs text-text-muted">
                        {member.user_email}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        aria-label={`Role for ${member.user_email}`}
                        defaultValue={member.role}
                        name="role"
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </Select>
                      <Button
                        disabled={!organization.can_manage}
                        loading={memberRoleMutation.isPending}
                        type="submit"
                        variant="secondary"
                      >
                        Save
                      </Button>
                      <Button
                        disabled={!organization.can_manage}
                        type="button"
                        variant="danger"
                        onClick={() => setRemoveTarget(member)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </form>
              ))}
            </div>
          ) : null}
          <ConfirmDialog
            confirmLabel="Remove member"
            confirmVariant="danger"
            message={`Remove ${removeTarget?.user_display_name ?? "this member"} from ${organization.display_name}?`}
            onClose={() => setRemoveTarget(null)}
            onConfirm={() => {
              if (removeTarget) {
                void removeMemberMutation.mutateAsync(removeTarget.id);
              }
            }}
            open={removeTarget !== null}
            title="Remove member"
          />
        </Fieldset>
      </div>
    </div>
  );
}

type RepositorySection =
  | "overview"
  | "code"
  | "history"
  | "graph"
  | "changeset"
  | "branches"
  | "bookmarks"
  | "tags";

function resolveRepositorySection(
  pathname: string,
  basePath: string,
): RepositorySection {
  if (pathname === `${basePath}/code`) return "code";
  if (
    pathname === `${basePath}/history` ||
    pathname === `${basePath}/commits`
  ) {
    return "history";
  }
  if (pathname === `${basePath}/graph`) return "graph";
  if (pathname.startsWith(`${basePath}/changesets/`)) return "changeset";
  if (pathname === `${basePath}/branches`) return "branches";
  if (pathname === `${basePath}/bookmarks`) return "bookmarks";
  if (pathname === `${basePath}/tags`) return "tags";
  return "overview";
}

function repositorySectionNode(pathname: string) {
  const match = pathname.match(/\/changesets\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function findReadmePath(browseResult: RepositoryBrowseResult | undefined) {
  if (!browseResult || browseResult.kind !== "directory") return null;
  return (
    browseResult.entries.find((entry) => /^readme(\.|$)/i.test(entry.name))
      ?.path ?? null
  );
}

function filterChangesets(
  changesets: ChangesetSummary[],
  filters: {
    q: string;
    author: string;
    branch: string;
    path: string;
  },
) {
  return changesets.filter((changeset) => {
    const matchesQuery =
      !filters.q ||
      changeset.message.toLowerCase().includes(filters.q.toLowerCase()) ||
      changeset.node.toLowerCase().includes(filters.q.toLowerCase());
    const matchesAuthor =
      !filters.author ||
      changeset.author_name
        .toLowerCase()
        .includes(filters.author.toLowerCase());
    const matchesBranch =
      !filters.branch || changeset.branch === filters.branch;
    const matchesPath =
      !filters.path ||
      changeset.message.toLowerCase().includes(filters.path.toLowerCase());

    return matchesQuery && matchesAuthor && matchesBranch && matchesPath;
  });
}

function refRows(
  refs: RepositoryRef[],
  refType: "branch" | "bookmark" | "tag",
  basePath: string,
) {
  return refs.map((ref) => ({
    ...ref,
    refType,
    basePath,
  }));
}

export function RepositoryDetailPage() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { organizationSlug = "", repositorySlug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [provisionConfirmOpen, setProvisionConfirmOpen] = useState(false);
  const basePath = `/organizations/${organizationSlug}/repositories/${repositorySlug}`;
  const currentSection = resolveRepositorySection(location.pathname, basePath);
  const searchParams = new URLSearchParams(location.search);
  const selectedRevision = searchParams.get("revision");
  const selectedPath = searchParams.get("path") ?? "";
  const historyFilters = {
    q: searchParams.get("q") ?? "",
    author: searchParams.get("author") ?? "",
    branch: searchParams.get("branch") ?? "",
    path: searchParams.get("historyPath") ?? "",
  };

  const repositoryQuery = useQuery({
    queryKey: ["repository", organizationSlug, repositorySlug],
    queryFn: () => getRepository(organizationSlug, repositorySlug),
  });

  const refsQuery = useQuery({
    queryKey: ["repository-refs", organizationSlug, repositorySlug],
    queryFn: () => getRepositoryRefs(organizationSlug, repositorySlug),
    enabled: repositoryQuery.data?.is_browsable === true,
  });

  const browseQuery = useQuery({
    queryKey: [
      "repository-browse",
      organizationSlug,
      repositorySlug,
      selectedRevision ?? "",
      selectedPath,
    ],
    queryFn: () =>
      browseRepository(organizationSlug, repositorySlug, {
        revision: selectedRevision,
        path: selectedPath,
      }),
    enabled:
      repositoryQuery.data?.is_browsable === true && currentSection === "code",
  });

  const overviewRootQuery = useQuery({
    queryKey: [
      "repository-overview-root",
      organizationSlug,
      repositorySlug,
      selectedRevision ?? "",
    ],
    queryFn: () =>
      browseRepository(organizationSlug, repositorySlug, {
        revision: selectedRevision,
        path: "",
      }),
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      currentSection === "overview",
  });

  const readmePath = findReadmePath(overviewRootQuery.data);
  const overviewReadmeQuery = useQuery({
    queryKey: [
      "repository-overview-readme",
      organizationSlug,
      repositorySlug,
      selectedRevision ?? "",
      readmePath,
    ],
    queryFn: () =>
      browseRepository(organizationSlug, repositorySlug, {
        revision: selectedRevision,
        path: readmePath,
      }),
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      currentSection === "overview" &&
      Boolean(readmePath),
  });

  const historyQuery = useInfiniteQuery({
    queryKey: ["repository-history", organizationSlug, repositorySlug],
    queryFn: ({ pageParam }) =>
      listChangesets(organizationSlug, repositorySlug, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      (currentSection === "history" ||
        currentSection === "overview" ||
        currentSection === "graph"),
  });

  const changesetNode =
    currentSection === "changeset"
      ? repositorySectionNode(location.pathname)
      : null;

  const changesetQuery = useQuery({
    queryKey: [
      "repository-changeset",
      organizationSlug,
      repositorySlug,
      changesetNode,
    ],
    queryFn: () =>
      getChangeset(organizationSlug, repositorySlug, changesetNode ?? ""),
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      currentSection === "changeset" &&
      Boolean(changesetNode),
  });

  const diffQuery = useQuery({
    queryKey: [
      "repository-diff",
      organizationSlug,
      repositorySlug,
      changesetNode,
    ],
    queryFn: () =>
      getChangesetDiff(organizationSlug, repositorySlug, changesetNode ?? ""),
    enabled:
      repositoryQuery.data?.is_browsable === true &&
      currentSection === "changeset" &&
      Boolean(changesetNode),
  });

  const provisionMutation = useMutation({
    mutationFn: () =>
      provisionRepository(organizationSlug, repositorySlug, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository", organizationSlug, repositorySlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["repository-refs", organizationSlug, repositorySlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["repository-history", organizationSlug, repositorySlug],
      });
      navigate(`${basePath}/code`);
    },
  });

  if (repositoryQuery.isLoading) {
    return <LoadingState label="Loading repository metadata." />;
  }

  if (repositoryQuery.isError || !repositoryQuery.data) {
    return (
      <ErrorState
        title="Repository unavailable"
        description={
          repositoryQuery.error instanceof Error
            ? repositoryQuery.error.message
            : "Unable to load the repository."
        }
      />
    );
  }

  const repository = repositoryQuery.data;
  const refs = refsQuery.data;
  const changesets =
    historyQuery.data?.pages.flatMap((page) => page.changesets) ?? [];
  const latestChangeset = changesets[0];

  const historySearch = new URLSearchParams();
  if (historyFilters.q) historySearch.set("q", historyFilters.q);
  if (historyFilters.author) historySearch.set("author", historyFilters.author);
  if (historyFilters.branch) historySearch.set("branch", historyFilters.branch);
  if (historyFilters.path)
    historySearch.set("historyPath", historyFilters.path);
  const historySearchSuffix = historySearch.toString()
    ? `?${historySearch.toString()}`
    : "";

  const filteredChangesets = filterChangesets(changesets, historyFilters);
  const cloneUrls = buildCloneUrls(organizationSlug, repositorySlug);

  function setHistoryFilter(key: string, value: string) {
    const params = new URLSearchParams(location.search);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    navigate(`${basePath}/history?${params.toString()}`);
  }

  function renderOverview() {
    if (!repository.is_browsable) {
      return (
        <Fieldset
          title="Repository storage is not provisioned"
          description={repository.phase_status}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Surface inset>
              <h3 className="text-sm font-semibold text-text-primary">
                Provisioning state
              </h3>
              <p className="mt-2 text-sm text-text-secondary">
                {repository.provisioning_state === "failed"
                  ? "Provisioning failed. Retry after checking the backend request and repository storage."
                  : repository.provisioning_state === "provisioning"
                    ? "Provisioning is in progress. Clone and browser actions unlock after storage is ready."
                    : "Repository metadata exists, but storage has not been provisioned yet."}
              </p>
            </Surface>
            <Surface inset>
              <h3 className="text-sm font-semibold text-text-primary">
                Clone and access
              </h3>
              <p className="mt-2 text-sm text-text-secondary">
                Clone URLs become available once the repository reaches the
                ready state.
              </p>
              {repository.can_manage ? (
                <div className="mt-4">
                  <Button
                    disabled={repository.archived_at !== null}
                    loading={provisionMutation.isPending}
                    onClick={() => setProvisionConfirmOpen(true)}
                  >
                    Provision Mercurial repository
                  </Button>
                </div>
              ) : (
                <p className="mt-4 text-xs text-text-muted">
                  Provisioning requires organization owner, organization admin,
                  or repository admin access.
                </p>
              )}
            </Surface>
          </div>
        </Fieldset>
      );
    }

    return (
      <div className="grid gap-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <Fieldset
            title="Latest changeset"
            description="The most recent revision visible from repository history."
          >
            {latestChangeset ? (
              <div className="rounded-md border border-border bg-canvas p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span className="font-mono text-text-primary">
                    {latestChangeset.short_node}
                  </span>
                  <span title={formatAbsoluteTime(latestChangeset.timestamp)}>
                    {formatAbsoluteTime(latestChangeset.timestamp)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {firstLine(latestChangeset.message)}
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {latestChangeset.author_name}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`${basePath}/changesets/${latestChangeset.node}`}>
                    <Button variant="secondary">Open changeset</Button>
                  </Link>
                  <Link to={`${basePath}/history`}>
                    <Button variant="ghost">View history</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No changesets yet"
                description="This repository is provisioned but does not contain committed revisions."
              />
            )}
          </Fieldset>

          <Fieldset
            title="Clone and access"
            description="Trust-focused Mercurial clone flow for HTTPS and SSH."
          >
            <div className="grid gap-3">
              <div className="rounded-md border border-border bg-canvas p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                  HTTPS
                </div>
                <code className="mt-2 block overflow-x-auto rounded-sm bg-surface px-3 py-2 font-mono text-xs text-text-primary">
                  {cloneUrls.httpsCommand}
                </code>
              </div>
              <div className="rounded-md border border-border bg-canvas p-4">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                  SSH
                </div>
                <code className="mt-2 block overflow-x-auto rounded-sm bg-surface px-3 py-2 font-mono text-xs text-text-primary">
                  {cloneUrls.sshCommand}
                </code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setCloneOpen(true)}>
                  Open clone dialog
                </Button>
                <Link to="/settings?tab=tokens">
                  <Button variant="secondary">Manage tokens</Button>
                </Link>
                <Link to="/settings?tab=ssh-keys">
                  <Button variant="secondary">Manage SSH keys</Button>
                </Link>
              </div>
            </div>
          </Fieldset>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Fieldset
            title="Repository health"
            description="Provisioning, visibility, archive state, and revision targeting at a glance."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Visibility", repository.visibility],
                ["Provisioning", repository.provisioning_state],
                ["Role", repository.viewer_role ?? "metadata only"],
                ["Archive", repository.archived_at ? "Archived" : "Active"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-md border border-border bg-canvas px-4 py-3"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                    {label}
                  </div>
                  <div className="mt-2 text-sm font-medium text-text-primary">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </Fieldset>

          <Fieldset
            title="Quick links"
            description="Jump directly into repository work without reading through metadata."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { label: "Code", to: `${basePath}/code` },
                { label: "History", to: `${basePath}/history` },
                { label: "Graph", to: `${basePath}/graph` },
                { label: "Branches", to: `${basePath}/branches` },
                { label: "Tags", to: `${basePath}/tags` },
              ].map((link) => (
                <Link
                  key={link.label}
                  className="bg-surface-subtle px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                  to={link.to}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </Fieldset>
        </div>

        {overviewReadmeQuery.data &&
        overviewReadmeQuery.data.kind === "file" &&
        overviewReadmeQuery.data.content ? (
          <Fieldset
            title="README preview"
            description="Root documentation preview when a README is present."
          >
            <article className="overflow-x-auto border border-border bg-canvas p-4 text-text-primary">
              <MarkdownRenderer
                className="text-sm leading-6"
                content={overviewReadmeQuery.data.content}
              />
            </article>
          </Fieldset>
        ) : null}
      </div>
    );
  }

  function renderHistory() {
    if (!repository.is_browsable) {
      return (
        <EmptyState
          title="History unavailable"
          description="Repository history appears after Mercurial storage is provisioned."
        />
      );
    }

    if (historyQuery.isLoading) {
      return <LoadingState label="Loading repository history." />;
    }

    if (historyQuery.isError) {
      return (
        <ErrorState
          title="History unavailable"
          description={
            historyQuery.error instanceof Error
              ? historyQuery.error.message
              : "Unable to load repository history."
          }
        />
      );
    }

    return (
      <div className="grid gap-4">
        <Fieldset
          title="History"
          description="Mercurial-native changeset list with URL-preserved filters."
        >
          <div className="grid gap-3 lg:grid-cols-4">
            <Input
              aria-label="Filter by branch"
              label="Branch"
              placeholder="default"
              value={historyFilters.branch}
              onChange={(event) =>
                setHistoryFilter("branch", event.target.value)
              }
            />
            <Input
              aria-label="Filter by author"
              label="Author"
              placeholder="Tatwa"
              value={historyFilters.author}
              onChange={(event) =>
                setHistoryFilter("author", event.target.value)
              }
            />
            <Input
              aria-label="Filter by path"
              label="Path"
              placeholder="frontend/src"
              value={historyFilters.path}
              onChange={(event) =>
                setHistoryFilter("historyPath", event.target.value)
              }
            />
            <Input
              aria-label="Search changesets"
              label="Text query"
              placeholder="message or hash"
              value={historyFilters.q}
              onChange={(event) => setHistoryFilter("q", event.target.value)}
            />
          </div>
        </Fieldset>

        {filteredChangesets.length > 0 ? (
          <HistoryList
            basePath={basePath}
            changesets={filteredChangesets}
            hasNextPage={historyQuery.hasNextPage ?? false}
            isFetchingNextPage={historyQuery.isFetchingNextPage}
            linkSearch={historySearchSuffix}
            onLoadMore={() => void historyQuery.fetchNextPage()}
          />
        ) : (
          <EmptyState
            title="No matching changesets"
            description="Adjust the history filters to inspect other revisions."
          />
        )}
      </div>
    );
  }

  function renderRefs(
    title: string,
    refsList: RepositoryRef[],
    refType: "branch" | "bookmark" | "tag",
  ) {
    if (refsQuery.isLoading) {
      return <LoadingState label={`Loading ${title.toLowerCase()}.`} />;
    }

    if (refsQuery.isError) {
      return (
        <ErrorState
          title={`${title} unavailable`}
          description={
            refsQuery.error instanceof Error
              ? refsQuery.error.message
              : `Unable to load ${title.toLowerCase()}.`
          }
        />
      );
    }

    if (refsList.length === 0) {
      return (
        <EmptyState
          title={`No ${title.toLowerCase()} available`}
          description={`This repository does not currently expose any ${title.toLowerCase()} to browse.`}
        />
      );
    }

    return (
      <Fieldset
        title={title}
        description={`Browse repository ${title.toLowerCase()} as first-class Mercurial revision targets.`}
      >
        <DataTable
          columns={[
            {
              key: "name",
              header: "Name",
              render: (ref) => ref.name,
            },
            {
              key: "type",
              header: "Type",
              render: () => refType,
            },
            {
              key: "target",
              header: "Target changeset",
              render: (ref) => (
                <span className="font-mono text-xs text-text-primary">
                  {ref.short_node}
                </span>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (ref) => (
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link
                    className="text-accent hover:underline"
                    to={`${basePath}/code${repositorySearch("", {
                      path: "",
                      revision: ref.name,
                    })}`}
                  >
                    Browse code
                  </Link>
                  <Link
                    className="text-accent hover:underline"
                    to={`${basePath}/changesets/${ref.node}`}
                  >
                    View changeset
                  </Link>
                </div>
              ),
            },
          ]}
          data={refRows(refsList, refType, basePath)}
          keyFn={(ref) => `${ref.refType}-${ref.name}`}
        />
      </Fieldset>
    );
  }

  function renderCurrentSection() {
    switch (currentSection) {
      case "overview":
        return renderOverview();
      case "code":
        if (browseQuery.isLoading) {
          return <LoadingState label="Loading repository content." />;
        }
        if (browseQuery.isError || !browseQuery.data) {
          return (
            <ErrorState
              title="Repository content unavailable"
              description={
                browseQuery.error instanceof Error
                  ? browseQuery.error.message
                  : "Unable to load repository content."
              }
            />
          );
        }
        return (
          <CodeBrowser
            basePath={basePath}
            browseResult={browseQuery.data}
            locationSearch={location.search}
            onSelectCodeRevision={(revision) => {
              navigate(
                `${basePath}/code${repositorySearch(location.search, {
                  path: selectedPath,
                  revision,
                })}`,
              );
            }}
            refs={refs}
            refsError={refsQuery.error}
            refsIsError={refsQuery.isError}
            selectedRevision={selectedRevision}
          />
        );
      case "history":
        return renderHistory();
      case "graph":
        return (
          <RepositoryGraphPage
            basePath={basePath}
            organizationSlug={organizationSlug}
            repositorySlug={repositorySlug}
            repository={repository}
            refs={refs}
            changesets={changesets}
            isLoading={historyQuery.isLoading}
            isError={historyQuery.isError}
            error={
              historyQuery.error instanceof Error ? historyQuery.error : null
            }
            hasNextPage={historyQuery.hasNextPage ?? false}
            isFetchingNextPage={historyQuery.isFetchingNextPage}
            onLoadMore={() => void historyQuery.fetchNextPage()}
            onRefresh={() => void historyQuery.refetch()}
          />
        );
      case "changeset":
        if (changesetQuery.isLoading || diffQuery.isLoading) {
          return <LoadingState label="Loading changeset detail." />;
        }
        if (changesetQuery.isError || !changesetQuery.data) {
          return (
            <ErrorState
              title="Changeset unavailable"
              description={
                changesetQuery.error instanceof Error
                  ? changesetQuery.error.message
                  : "Unable to load changeset detail."
              }
            />
          );
        }
        if (diffQuery.isError || !diffQuery.data) {
          return (
            <ErrorState
              title="Diff unavailable"
              description={
                diffQuery.error instanceof Error
                  ? diffQuery.error.message
                  : "Unable to load changeset diff."
              }
            />
          );
        }
        return (
          <ChangesetDetailView
            backLink={`${basePath}/history${historySearchSuffix}`}
            basePath={basePath}
            changeset={changesetQuery.data}
            diff={diffQuery.data}
          />
        );
      case "branches":
        return renderRefs("Branches", refs?.branches ?? [], "branch");
      case "bookmarks":
        return renderRefs("Bookmarks", refs?.bookmarks ?? [], "bookmark");
      case "tags":
        return renderRefs("Tags", refs?.tags ?? [], "tag");
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {renderCurrentSection()}
      <CloneDialog
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        organizationSlug={organizationSlug}
        repositorySlug={repositorySlug}
      />
      <ConfirmDialog
        confirmLabel="Provision repository"
        message={`Provision Mercurial storage for ${repository.display_name}?`}
        onClose={() => setProvisionConfirmOpen(false)}
        onConfirm={() => {
          setProvisionConfirmOpen(false);
          void provisionMutation.mutateAsync();
        }}
        open={provisionConfirmOpen}
        title="Provision Mercurial repository"
      />
    </div>
  );
}

type SettingsSection =
  "general" | "access" | "transport" | "webhooks" | "audit" | "danger";

function getSettingsSection(search: string): SettingsSection {
  const current = new URLSearchParams(search).get("section");
  const sections: SettingsSection[] = [
    "general",
    "access",
    "transport",
    "webhooks",
    "audit",
    "danger",
  ];
  return sections.includes(current as SettingsSection)
    ? (current as SettingsSection)
    : "general";
}

export function RepositorySettingsPage() {
  return (
    <ProtectedRoute>
      <RepositorySettingsContent />
    </ProtectedRoute>
  );
}

function RepositorySettingsContent() {
  const queryClient = useQueryClient();
  const { csrfToken } = useAuth();
  const { organizationSlug = "", repositorySlug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [permissionUserId, setPermissionUserId] = useState("");
  const [permissionRole, setPermissionRole] = useState<
    "read" | "write" | "admin"
  >("read");
  const [revokePermissionTarget, setRevokePermissionTarget] =
    useState<RepositoryPermission | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const section = getSettingsSection(location.search);
  const repositoryQuery = useQuery({
    queryKey: ["repository", organizationSlug, repositorySlug],
    queryFn: () => getRepository(organizationSlug, repositorySlug),
  });
  const permissionsQuery = useQuery({
    queryKey: ["repository-permissions", organizationSlug, repositorySlug],
    queryFn: () => listRepositoryPermissions(organizationSlug, repositorySlug),
    enabled: repositoryQuery.isSuccess,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      display_name?: string;
      description?: string | null;
      visibility?: "public" | "internal" | "private";
      archived?: boolean;
    }) =>
      updateRepository(organizationSlug, repositorySlug, payload, csrfToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository", organizationSlug, repositorySlug],
      });
      await queryClient.invalidateQueries({
        queryKey: ["organization-repositories", organizationSlug],
      });
    },
  });

  const permissionMutation = useMutation({
    mutationFn: () =>
      setRepositoryPermission(
        organizationSlug,
        repositorySlug,
        permissionUserId,
        { role: permissionRole },
        csrfToken,
      ),
    onSuccess: async () => {
      setPermissionUserId("");
      setPermissionRole("read");
      await queryClient.invalidateQueries({
        queryKey: ["repository-permissions", organizationSlug, repositorySlug],
      });
    },
  });

  const deletePermissionMutation = useMutation({
    mutationFn: (userId: string) =>
      deleteRepositoryPermission(
        organizationSlug,
        repositorySlug,
        userId,
        csrfToken,
      ),
    onSuccess: async () => {
      setRevokePermissionTarget(null);
      await queryClient.invalidateQueries({
        queryKey: ["repository-permissions", organizationSlug, repositorySlug],
      });
    },
  });

  if (repositoryQuery.isLoading) {
    return <LoadingState label="Loading repository settings." />;
  }

  if (repositoryQuery.isError || !repositoryQuery.data) {
    return (
      <ErrorState
        title="Repository settings unavailable"
        description={
          repositoryQuery.error instanceof Error
            ? repositoryQuery.error.message
            : "Unable to load repository settings."
        }
      />
    );
  }

  const repository = repositoryQuery.data;
  if (!repository.can_manage) {
    return (
      <ErrorState
        title="Permission denied"
        description="Repository settings are limited to organization owners, organization admins, and explicit repository admins."
      />
    );
  }

  const settingsSections: Array<{ id: SettingsSection; label: string }> = [
    { id: "general", label: "General" },
    { id: "access", label: "Access" },
    { id: "transport", label: "Clone & Transport" },
    { id: "webhooks", label: "Webhooks" },
    { id: "audit", label: "Audit" },
    { id: "danger", label: "Danger zone" },
  ];

  const cloneUrls = buildCloneUrls(organizationSlug, repositorySlug);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Repository settings"
        title={repository.display_name}
        description="Keep normal settings, access control, transport posture, audit context, and dangerous actions clearly separated."
      />

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <Surface className="h-fit p-2">
          <nav className="grid gap-1" aria-label="Repository settings sections">
            {settingsSections.map((item) => (
              <button
                key={item.id}
                type="button"
                className={clsx(
                  "px-3 py-2 text-left text-sm transition-colors",
                  section === item.id
                    ? "bg-accent-subtle font-medium text-accent"
                    : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
                )}
                onClick={() => navigate(`?section=${item.id}`)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </Surface>

        <div className="grid gap-4">
          {section === "general" ? (
            <Fieldset
              title="General"
              description="Repository identity, description, visibility, and archive state."
            >
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void updateMutation.mutateAsync({
                    display_name: String(form.get("display_name") ?? ""),
                    description: String(form.get("description") ?? ""),
                    visibility: String(form.get("visibility")) as
                      "public" | "internal" | "private",
                    archived: form.get("archived") === "on",
                  });
                }}
              >
                <FormField label="Display name">
                  <Input
                    aria-label="Repository display name"
                    defaultValue={repository.display_name}
                    name="display_name"
                  />
                </FormField>
                <FormField label="Description">
                  <textarea
                    aria-label="Repository description"
                    className="min-h-24 w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    defaultValue={repository.description ?? ""}
                    name="description"
                  />
                </FormField>
                <FormField label="Visibility">
                  <Select
                    aria-label="Repository visibility"
                    defaultValue={repository.visibility}
                    name="visibility"
                  >
                    <option value="private">private</option>
                    <option value="internal">internal</option>
                    <option value="public">public</option>
                  </Select>
                </FormField>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    aria-label="Archive repository"
                    defaultChecked={repository.archived_at !== null}
                    name="archived"
                    type="checkbox"
                  />
                  Archive repository
                </label>
                {updateMutation.isError ? (
                  <MessageBanner
                    message={
                      updateMutation.error instanceof Error
                        ? updateMutation.error.message
                        : "Unable to save repository settings."
                    }
                  />
                ) : null}
                <Button loading={updateMutation.isPending} type="submit">
                  Save repository settings
                </Button>
              </form>
            </Fieldset>
          ) : null}

          {section === "access" ? (
            <Fieldset
              title="Access control"
              description="Separate inherited organization access from direct repository overrides."
            >
              <div className="rounded-md border border-border bg-canvas px-4 py-3 text-sm text-text-secondary">
                Organization owners and admins inherit repository administration
                automatically. Direct repository permissions below add or narrow
                access without changing organization-wide roles.
              </div>

              <form
                className="grid gap-4 rounded-md border border-border bg-canvas p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void permissionMutation.mutateAsync();
                }}
              >
                <FormField
                  label="Target user ID"
                  hint="Current backend support accepts a user UUID."
                >
                  <Input
                    aria-label="Permission user ID"
                    placeholder="Paste a user UUID"
                    value={permissionUserId}
                    onChange={(event) =>
                      setPermissionUserId(event.target.value)
                    }
                  />
                </FormField>
                <FormField label="Role">
                  <Select
                    aria-label="Permission role"
                    value={permissionRole}
                    onChange={(event) =>
                      setPermissionRole(
                        event.target.value as "read" | "write" | "admin",
                      )
                    }
                  >
                    <option value="read">read</option>
                    <option value="write">write</option>
                    <option value="admin">admin</option>
                  </Select>
                </FormField>
                {permissionMutation.isError ? (
                  <MessageBanner
                    message={
                      permissionMutation.error instanceof Error
                        ? permissionMutation.error.message
                        : "Unable to save repository permission."
                    }
                  />
                ) : null}
                <Button
                  disabled={!permissionUserId.trim()}
                  loading={permissionMutation.isPending}
                  type="submit"
                >
                  Save permission
                </Button>
              </form>

              {permissionsQuery.isLoading ? (
                <LoadingState label="Loading repository permissions." />
              ) : permissionsQuery.data && permissionsQuery.data.length > 0 ? (
                <DataTable
                  columns={[
                    {
                      key: "subject",
                      header: "Subject",
                      render: (permission) => (
                        <div className="min-w-0">
                          <div className="font-medium text-text-primary">
                            {permission.user_display_name}
                          </div>
                          <div className="text-xs text-text-muted">
                            {permission.user_email}
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "source",
                      header: "Source",
                      render: () => "Direct",
                    },
                    {
                      key: "role",
                      header: "Role",
                      render: (permission) => permission.role,
                    },
                    {
                      key: "changed",
                      header: "Last changed",
                      render: (permission) =>
                        formatShortTime(permission.updated_at),
                    },
                    {
                      key: "actions",
                      header: "Actions",
                      render: (permission) => (
                        <Button
                          size="sm"
                          type="button"
                          variant="danger"
                          onClick={() => setRevokePermissionTarget(permission)}
                        >
                          Revoke
                        </Button>
                      ),
                    },
                  ]}
                  data={permissionsQuery.data}
                  keyFn={(permission) => permission.id}
                />
              ) : (
                <EmptyState
                  title="No explicit permissions yet"
                  description="Organization-level access still applies even without direct repository rows."
                />
              )}
            </Fieldset>
          ) : null}

          {section === "transport" ? (
            <Fieldset
              title="Clone and transport"
              description="HTTPS and SSH clone posture, rate limiting, and access guidance."
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <Surface inset>
                  <h3 className="text-sm font-semibold text-text-primary">
                    HTTPS
                  </h3>
                  <code className="mt-2 block overflow-x-auto rounded-sm bg-canvas px-3 py-2 font-mono text-xs text-text-primary">
                    {cloneUrls.httpsCommand}
                  </code>
                  <p className="mt-2 text-sm text-text-secondary">
                    Use your RevForge username and a personal access token as
                    the password.
                  </p>
                </Surface>
                <Surface inset>
                  <h3 className="text-sm font-semibold text-text-primary">
                    SSH
                  </h3>
                  <code className="mt-2 block overflow-x-auto rounded-sm bg-canvas px-3 py-2 font-mono text-xs text-text-primary">
                    {cloneUrls.sshCommand}
                  </code>
                  <p className="mt-2 text-sm text-text-secondary">
                    SSH key status and transport telemetry will appear here once
                    backend key endpoints are connected.
                  </p>
                </Surface>
              </div>
            </Fieldset>
          ) : null}

          {section === "webhooks" ? (
            <Fieldset
              title="Webhooks"
              description="Webhook delivery settings remain isolated until backend support is available."
            >
              <EmptyState
                title="Webhook management is not connected yet"
                description="The UI keeps this section reserved so transport, access, and webhook administration stay distinct once backend webhook endpoints land."
              />
            </Fieldset>
          ) : null}

          {section === "audit" ? (
            <Fieldset
              title="Audit"
              description="Repository-scoped audit views will land once the backend exposes repository activity filters."
            >
              <div className="rounded-md border border-border bg-canvas px-4 py-3 text-sm text-text-secondary">
                Use the global activity page for current audit exploration.
                Repository-specific activity filtering will plug into this
                section without mixing audit concerns into general settings.
              </div>
              <div>
                <Link to="/activity">
                  <Button variant="secondary">Open activity</Button>
                </Link>
              </div>
            </Fieldset>
          ) : null}

          {section === "danger" ? (
            <Fieldset
              title="Danger zone"
              description="High-risk actions require explicit confirmation and should never be mixed into normal settings."
            >
              <div className="divide-y divide-border rounded-md border border-danger/30">
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      Archive repository
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      Prevent pushes and mark the repository as read-only while
                      retaining metadata and history.
                    </p>
                  </div>
                  <Button
                    disabled={repository.archived_at !== null}
                    type="button"
                    variant="danger"
                    onClick={() => setArchiveDialogOpen(true)}
                  >
                    {repository.archived_at ? "Archived" : "Archive"}
                  </Button>
                </div>
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      Rename slug
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      Future backend work will add safe slug changes once clone
                      URL migration rules are defined.
                    </p>
                  </div>
                  <Button disabled type="button" variant="danger">
                    Rename
                  </Button>
                </div>
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      Delete repository
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                      This remains disabled until backend deletion flows are
                      implemented safely.
                    </p>
                  </div>
                  <Button disabled type="button" variant="danger">
                    Delete
                  </Button>
                </div>
              </div>
            </Fieldset>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Archive repository"
        confirmVariant="danger"
        message={`Archive ${repository.display_name} and disable push access?`}
        onClose={() => setArchiveDialogOpen(false)}
        onConfirm={() => {
          void updateMutation.mutateAsync({ archived: true });
        }}
        open={archiveDialogOpen}
        requireTyping={repository.slug}
        title="Archive repository"
      />

      <ConfirmDialog
        confirmLabel="Revoke access"
        confirmVariant="danger"
        message={`Revoke explicit access for ${revokePermissionTarget?.user_display_name ?? "this user"}?`}
        onClose={() => setRevokePermissionTarget(null)}
        onConfirm={() => {
          if (revokePermissionTarget) {
            void deletePermissionMutation.mutateAsync(
              revokePermissionTarget.user_id,
            );
          }
        }}
        open={revokePermissionTarget !== null}
        title="Revoke repository access"
      />
    </div>
  );
}

export function ReviewsPage() {
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Reviews"
          title="Review workflows are reserved for repository-native collaboration"
          description="Repository review shells will expand here once backend review endpoints and compare semantics are fully wired."
        />
        <EmptyState
          title="Review list not connected yet"
          description="This placeholder stays isolated so the shell can reserve top-level review navigation without inventing fake review data."
        />
      </div>
    </ProtectedRoute>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <EmptyState
        title="Page not found"
        description="The route does not exist in this RevForge workspace."
        action={
          <Link to="/">
            <Button>Return to dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}
