import { useState } from "react";
import { buildCloneUrls } from "../lib/formatting";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CopyButton } from "./ui/copy-button";

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
  const cloneUrls = buildCloneUrls(organizationSlug, repositorySlug);

  if (!open) {
    return null;
  }

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
                  className={`rounded-sm border px-3 py-2 text-sm font-medium ${
                    protocol === item.id
                      ? "border-border-strong bg-surface-muted text-text-primary"
                      : "border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  }`}
                  onClick={() => setProtocol(item.id as "https" | "ssh")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-5">
            <div className="rounded-md border border-border bg-canvas p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
                {protocol === "https" ? "HTTPS command" : "SSH command"}
              </div>
              <code className="mt-3 block overflow-x-auto rounded-sm border border-border bg-surface px-3 py-3 font-mono text-xs text-text-primary">
                {protocol === "https"
                  ? cloneUrls.httpsCommand
                  : cloneUrls.sshCommand}
              </code>
              <div className="mt-3">
                <CopyButton
                  label="Copy command"
                  text={
                    protocol === "https"
                      ? cloneUrls.httpsCommand
                      : cloneUrls.sshCommand
                  }
                />
              </div>
            </div>

            {protocol === "https" ? (
              <div className="rounded-md border border-border-strong bg-surface-muted p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="info">Authentication</Badge>
                  <span className="text-sm font-medium text-text-primary">
                    Personal access token
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Use your RevForge username and a personal access token as the
                  password. Tokens belong in your credential manager, not shell
                  history.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={onClose}>
                    Create token
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onClose}>
                    Manage tokens
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-canvas p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="warning">SSH status</Badge>
                  <span className="text-sm font-medium text-text-primary">
                    Key status not connected yet
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">
                  Live SSH key health is not connected in this environment yet.
                  Review keys in user settings before cloning over SSH.
                </p>
                <div className="mt-3">
                  <Button size="sm" variant="secondary" onClick={onClose}>
                    Manage SSH keys
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
