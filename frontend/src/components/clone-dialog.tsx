import { useState } from "react";
import { buildCloneUrls } from "../lib/formatting";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CopyButton } from "./ui/copy-button";
import { Dialog } from "./ui/dialog";

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Clone repository"
      className="max-w-2xl p-0"
    >
      <div className="border-b border-border px-5 py-4">
        <div className="font-mono text-xs text-text-muted">
          {organizationSlug}/{repositorySlug}
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Never place personal access tokens into clone URLs. Use a token as the
          HTTPS password or a registered SSH key.
        </p>
      </div>

      <div className="border-b border-border px-4">
        <div className="flex gap-2 py-2">
          {[
            { id: "https", label: "HTTPS" },
            { id: "ssh", label: "SSH" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                protocol === item.id
                  ? "bg-accent-subtle text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setProtocol(item.id as "https" | "ssh")}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5">
        <div className="rounded-md border border-border bg-canvas p-4">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            {protocol === "https" ? "HTTPS command" : "SSH command"}
          </div>
          <code className="mt-3 block overflow-x-auto rounded-sm bg-surface px-3 py-2 font-mono text-xs text-text-primary">
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
          <div className="rounded-md border border-info/30 bg-info-subtle p-4">
            <div className="flex items-center gap-2">
              <Badge variant="info">Authentication</Badge>
              <span className="text-sm font-medium text-text-primary">
                Personal access token
              </span>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Use your RevForge username and a personal access token as the
              password. Tokens should be stored in your credential manager, not
              shell history.
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
              The UI is ready for SSH key health, but this environment does not
              yet expose live key status. Add or review keys from user settings
              before cloning over SSH.
            </p>
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={onClose}>
                Manage SSH keys
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
