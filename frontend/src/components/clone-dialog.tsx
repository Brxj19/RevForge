import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getRepositoryTransport } from "../lib/api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CopyButton } from "./ui/copy-button";
import { ErrorState, LoadingState } from "./states";

interface CloneDialogProps {
  organizationSlug: string;
  repositorySlug: string;
  open: boolean;
  onClose: () => void;
}

export function CloneDialog({
  organizationSlug,
  repositorySlug,
  open,
  onClose,
}: CloneDialogProps) {
  const [protocol, setProtocol] = useState<"https" | "ssh">("https");
  const navigate = useNavigate();
  const transportQuery = useQuery({
    queryKey: ["repository-transport", organizationSlug, repositorySlug],
    queryFn: () => getRepositoryTransport(organizationSlug, repositorySlug),
    enabled: open,
  });

  if (!open) {
    return null;
  }

  const body = (() => {
    if (transportQuery.isLoading) {
      return <LoadingState label="Loading clone setup." />;
    }
    if (transportQuery.isError || !transportQuery.data) {
      return (
        <ErrorState
          title="Clone setup unavailable"
          description={
            transportQuery.error instanceof Error
              ? transportQuery.error.message
              : "Unable to load repository transport metadata."
          }
        />
      );
    }

    const transport = transportQuery.data;
    const command =
      protocol === "https"
        ? transport.https.clone_command
        : transport.ssh.clone_command;
    const permissionLabel = transport.repository.viewer_role ?? "no access";
    const isHttpsReady = transport.setup.has_active_token;
    const isSshReady = transport.setup.has_active_ssh_key;

    return (
      <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-5">
        <div className="grid gap-3 rounded-md border border-border bg-canvas p-4 md:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
              Provisioning
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {transport.repository.provisioning_state}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
              Permission
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {permissionLabel}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
              Next step
            </div>
            <div className="mt-2 text-sm text-text-primary">
              {transport.setup.recommended_next_step.replaceAll("_", " ")}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-canvas p-4">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            {protocol === "https" ? "HTTPS command" : "SSH command"}
          </div>
          <code className="mt-3 block overflow-x-auto rounded-sm border border-border bg-surface px-3 py-3 font-mono text-xs text-text-primary">
            {command}
          </code>
          <div className="mt-3">
            <CopyButton label="Copy command" text={command} />
          </div>
        </div>

        {protocol === "https" ? (
          <div className="rounded-md border border-border-strong bg-surface-muted p-4">
            <div className="flex items-center gap-2">
              <Badge variant={isHttpsReady ? "success" : "info"}>
                {isHttpsReady ? "Ready" : "Setup required"}
              </Badge>
              <span className="text-sm font-medium text-text-primary">
                HTTPS clone
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-text-secondary">
              <div>
                Username:{" "}
                <span className="font-mono text-text-primary">
                  {transport.https.username_hint}
                </span>
              </div>
              <div>
                Password:{" "}
                <span className="font-mono text-text-primary">
                  {transport.https.password_hint}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigate("/settings?tab=tokens&intent=create");
                  onClose();
                }}
              >
                Create token
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigate("/settings?tab=tokens");
                  onClose();
                }}
              >
                Manage tokens
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-canvas p-4">
            <div className="flex items-center gap-2">
              <Badge variant={isSshReady ? "success" : "warning"}>
                {isSshReady ? "Ready" : "Setup required"}
              </Badge>
              <span className="text-sm font-medium text-text-primary">
                SSH clone
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-text-secondary">
              <div>
                SSH username:{" "}
                <span className="font-mono text-text-primary">
                  {transport.ssh.username}
                </span>
              </div>
              <div>
                Port:{" "}
                <span className="font-mono text-text-primary">
                  {transport.ssh.port ?? 22}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigate("/settings?tab=ssh-keys&intent=create");
                  onClose();
                }}
              >
                Add SSH key
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigate("/settings?tab=ssh-keys");
                  onClose();
                }}
              >
                Manage SSH keys
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div className="ml-auto flex h-full w-full max-w-2xl">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Clone repository"
          className="flex h-full w-full flex-col border-l border-border bg-surface shadow-dialog"
        >
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.16em] text-text-muted">
                  Clone repository
                </div>
                <div className="mt-2 text-sm text-text-primary">
                  {organizationSlug}/{repositorySlug}
                </div>
                <p className="mt-2 max-w-xl text-sm text-text-secondary">
                  Use a personal access token as the HTTPS password or a
                  registered SSH key. Never place credentials inside clone URLs.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>

          <div className="border-b border-border px-5 py-3">
            <div className="flex gap-2">
              {[
                { id: "https", label: "HTTPS" },
                { id: "ssh", label: "SSH" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`px-3 py-2 text-sm font-medium ${
                    protocol === item.id
                      ? "bg-accent-subtle text-accent"
                      : "bg-surface-subtle text-text-secondary hover:bg-accent-subtle hover:text-accent"
                  }`}
                  onClick={() => setProtocol(item.id as "https" | "ssh")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {body}
        </div>
      </div>
    </div>
  );
}
