import { useState } from "react";
import { CopyButton } from "./ui/copy-button";
import { Badge } from "./ui/badge";

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

  if (!open) return null;

  const host = window.location.host;
  const httpsUrl = `https://${host}/hg/${organizationSlug}/${repositorySlug}`;
  const sshUrl = `ssh://hg@${host}/${organizationSlug}/${repositorySlug}`;
  const httpsCmd = `hg clone ${httpsUrl}`;
  const sshCmd = `hg clone ${sshUrl}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Clone repository"
    >
      <div
        className="mx-4 w-full max-w-lg rounded-xl border border-border bg-surface shadow-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Clone repository
            </h2>
            <p className="mt-0.5 font-mono text-xs text-text-muted">
              {organizationSlug}/{repositorySlug}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-accent-subtle transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Protocol tabs */}
        <div className="flex border-b border-border">
          <button
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              protocol === "https"
                ? "border-b-2 border-accent text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            onClick={() => setProtocol("https")}
          >
            HTTPS
          </button>
          <button
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              protocol === "ssh"
                ? "border-b-2 border-accent text-accent"
                : "text-text-muted hover:text-text-primary"
            }`}
            onClick={() => setProtocol("ssh")}
          >
            SSH
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5 px-5 py-4">
          {/* Clone command */}
          <div>
            <p className="text-xs font-medium text-text-secondary">
              {protocol === "https" ? "HTTPS" : "SSH"}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm text-text-primary">
                {protocol === "https" ? httpsCmd : sshCmd}
              </code>
              <CopyButton text={protocol === "https" ? httpsCmd : sshCmd} />
            </div>
          </div>

          {/* HTTPS auth help */}
          {protocol === "https" ? (
            <div className="rounded-md border border-info-subtle bg-info-subtle px-3 py-2.5 text-sm text-info">
              <p className="font-medium">Authentication</p>
              <p className="mt-1">
                Use your RevForge username and a{" "}
                <strong>personal access token</strong> as the password.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-md border border-info bg-info px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 transition-all"
                >
                  Create token
                </button>
                <button
                  onClick={onClose}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-accent-subtle transition-colors"
                >
                  Manage tokens
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-canvas px-3 py-2.5">
              <p className="text-xs font-medium text-text-secondary">SSH status</p>
              <p className="mt-1 text-sm text-text-primary">
                <Badge variant="warning">No SSH key configured</Badge>
              </p>
              <button
                onClick={onClose}
                className="mt-2 text-xs text-accent hover:underline"
              >
                Manage SSH keys
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
