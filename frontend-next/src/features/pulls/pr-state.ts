import type { IconName } from "~/ui/icons";

export type PrState = "open" | "draft" | "merged" | "closed";

export type ReviewDecision =
  | "approved"
  | "changes_requested"
  | "comment"
  | "commented"
  | "pending";

export function prStateIcon(state: PrState): IconName {
  switch (state) {
    case "open":
      return "pr";
    case "draft":
      return "prDraft";
    case "merged":
      return "merge";
    case "closed":
      return "prClosed";
  }
}

export function prStateLabel(state: PrState): string {
  switch (state) {
    case "open":
      return "Open";
    case "draft":
      return "Draft";
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
  }
}

export function reviewDecisionLabel(
  decision: ReviewDecision,
): string {
  switch (decision) {
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    case "comment":
    case "commented":
      return "Commented";
    case "pending":
      return "Pending";
  }
}

export function reviewDecisionIcon(
  decision: ReviewDecision,
): IconName {
  switch (decision) {
    case "approved":
      return "check";
    case "changes_requested":
      return "warn";
    case "comment":
    case "commented":
      return "review";
    case "pending":
      return "clock";
  }
}

/** CSS class token for the reviewer mark dot color. */
export function reviewDecisionColor(
  decision: ReviewDecision,
): "green" | "red" | "muted" | "accent" {
  switch (decision) {
    case "approved":
      return "green";
    case "changes_requested":
      return "red";
    case "comment":
    case "commented":
      return "accent";
    case "pending":
      return "muted";
  }
}

/** Whether all required reviewers approved (for "ready to merge" pill). */
export function isReadyToMerge(
  reviewers: ReadonlyArray<{ required: boolean; decision: string }>,
): boolean {
  if (reviewers.length === 0) return false;
  const required = reviewers.filter((r) => r.required);
  if (required.length === 0) return false;
  return required.every((r) => r.decision === "approved");
}

/** Whether any reviewer requested changes. */
export function hasChangesRequested(
  reviewers: ReadonlyArray<{ decision: string }>,
): boolean {
  return reviewers.some((r) => r.decision === "changes_requested");
}
