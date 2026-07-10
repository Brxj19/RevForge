import { useState } from "react";
import { Button } from "../components/ui/button";
import { IconButton } from "../components/ui/icon-button";
import { Badge } from "../components/ui/badge";
import { CopyButton } from "../components/ui/copy-button";
import { Dialog, DialogActions } from "../components/ui/dialog";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Tabs, TabContent } from "../components/ui/tabs";
import { DataTable } from "../components/ui/data-table";
import { LoadingState, EmptyState, ErrorState } from "../components/states";

const SAMPLE_DATA = [
  { id: "1", name: "payments-api", role: "write", updated: "2h ago" },
  { id: "2", name: "web-frontend", role: "admin", updated: "1d ago" },
  { id: "3", name: "docs", role: "read", updated: "3d ago" },
];

export function DevUiPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const [inputValue, setInputValue] = useState("");

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold text-text-primary">Dev UI Preview</h1>
        <p className="mt-1 text-sm text-text-muted">Component library preview and testing</p>
      </div>

      <Tabs
        tabs={[
          { id: "preview", label: "Preview" },
          { id: "states", label: "States" },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <TabContent active={activeTab === "preview"}>
        <section className="space-y-8">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Buttons</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" loading>Loading</Button>
              <Button variant="primary" disabled>Disabled</Button>
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="lg">Large</Button>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Icon Buttons</h2>
            <div className="flex items-center gap-2">
              <IconButton aria-label="Settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.5 2.5l1.5 1.5M12 12l1.5 1.5M2.5 13.5l1.5-1.5M12 4l1.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </IconButton>
              <IconButton aria-label="Search" size="sm">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </IconButton>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Badges</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="neutral">Neutral</Badge>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Copy Button</h2>
            <div className="flex items-center gap-2">
              <CopyButton text="hg clone https://revforge.example.com/hg/acme/payments-api" />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Inputs</h2>
            <div className="flex flex-col gap-3 max-w-sm">
              <Input label="Display Name" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Enter name" />
              <Input label="Email" type="email" placeholder="user@example.com" />
              <Input label="With Error" error="This field is required." />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Select</h2>
            <div className="max-w-xs">
              <Select label="Repository Role">
                <option value="read">Read</option>
                <option value="write">Write</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Dialog</h2>
            <Button onClick={() => setDialogOpen(true)}>Open Dialog</Button>
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Create Repository">
              <p className="text-sm text-text-secondary">This is a dialog example. Focus is trapped and Escape closes it.</p>
              <DialogActions>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => setDialogOpen(false)}>Create</Button>
              </DialogActions>
            </Dialog>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Confirm Dialog</h2>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete Repository</Button>
            <ConfirmDialog
              open={confirmOpen}
              onClose={() => setConfirmOpen(false)}
              onConfirm={() => {}}
              title="Delete repository"
              message="This will permanently delete the repository and all its data. This action cannot be undone."
              confirmLabel="Delete"
              confirmVariant="danger"
              requireTyping="payments-api"
            />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Data Table</h2>
            <DataTable
              columns={[
                { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
                { key: "role", header: "Role", render: (r) => <Badge variant={r.role === "admin" ? "primary" : r.role === "write" ? "success" : "default"}>{r.role}</Badge> },
                { key: "updated", header: "Updated", render: (r) => <span className="text-text-muted">{r.updated}</span> },
              ]}
              data={SAMPLE_DATA}
              keyFn={(r) => r.id}
            />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Data Table Loading</h2>
            <DataTable
              columns={[
                { key: "name", header: "Name", render: () => null },
                { key: "role", header: "Role", render: () => null },
              ]}
              data={[]}
              keyFn={() => ""}
              loading
            />
          </div>
        </section>
      </TabContent>

      <TabContent active={activeTab === "states"}>
        <section className="space-y-6 max-w-2xl">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Loading State</h2>
            <LoadingState label="Loading repository..." />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Empty State</h2>
            <EmptyState
              title="No repositories yet"
              description="Create your first organization and repository, then provision Mercurial storage."
              action={<Button variant="primary" size="sm">Create organization</Button>}
            />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">Error State</h2>
            <ErrorState
              title="Failed to load repository"
              description="The repository could not be loaded. It may have been archived or you may not have access."
              requestId="req_abc123"
              retry={() => {}}
            />
          </div>
        </section>
      </TabContent>
    </div>
  );
}
