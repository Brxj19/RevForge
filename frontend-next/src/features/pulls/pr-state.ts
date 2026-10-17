import type { IconName } from "~/ui/icons";

export type PrState = "open" | "draft" | "merged" | "closed";

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
  decision: "approved" | "changes_requested" | "comment",
): string {
  switch (decision) {
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    case "comment":
      return "Commented";
  }
}

export function reviewDecisionIcon(
  decision: "approved" | "changes_requested" | "comment",
): IconName {
  switch (decision) {
    case "approved":
      return "check";
    case "changes_requested":
      return "x";
    case "comment":
      return "review";
  }
}
