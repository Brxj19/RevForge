// Fixtures for the Home page: attention items, activity feed, heatmap data.
import type {
  AttentionItem,
  ContributionActivity,
  ContributionDay,
} from "~/lib/api/types";

const HEAT_REPOS = [
  ["sigma-reckitt", "#58a6ff"],
  ["payments-api", "#3fb950"],
  ["infra-scripts", "#e3b341"],
  ["design-tokens", "#bc8cff"],
] as const;

/**
 * Deterministic 30-week (210-day) contribution activity ending on `today`
 * (prototype HEAT generator). Anchoring on `today` keeps the mock heatmap
 * populated regardless of the host clock.
 */
export function generateContributionActivity(
  today: Date = new Date(),
  seedOffset = 0,
): ContributionActivity {
  const days: ContributionDay[] = [];
  let total = 0;

  for (let i = 0; i < 210; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - (209 - i));
    const x = Math.sin((i + seedOffset) * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    const k = Math.floor(r * 1000);
    let count =
      r > 0.86
        ? 8 + (k % 5)
        : r > 0.72
          ? 5 + (k % 3)
          : r > 0.55
            ? 3 + (k % 2)
            : r > 0.38
              ? 1 + (k % 2)
              : 0;
    if (d.getDay() === 0 || d.getDay() === 6) count = Math.floor(count / 3);

    const byRepo: Array<{ name: string; color: string; count: number }> = [];
    let left = count;
    for (const [j, [name, color]] of HEAT_REPOS.entries()) {
      if (!left) break;
      const take =
        j === HEAT_REPOS.length - 1
          ? left
          : Math.min(left, Math.ceil(left * ([0.55, 0.6, 0.7, 1][j] ?? 1)));
      byRepo.push({ name, color, count: take });
      left -= take;
    }

    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    total += count;
    days.push({
      date: iso,
      count,
      byRepo,
      additions: count * (11 + (k % 37)),
      deletions: count * (2 + (k % 9)),
    });
  }

  return {
    total,
    range: {
      start_date: days[0]?.date ?? "",
      end_date: days[days.length - 1]?.date ?? "",
    },
    days,
  };
}

export const ATTENTION_ITEMS: AttentionItem[] = [
  {
    kind: "webhook_failing",
    title: "Webhook to ci.sigma.dev failing",
    detail: "payments-api returned HTTP 502 on the last 3 deliveries",
    href: "/sigma/payments-api/settings/webhooks",
  },
  {
    kind: "provisioning",
    title: "infra-scripts is still provisioning",
    detail: "Pushes are rejected until storage is ready",
    href: "/sigma/infra-scripts",
  },
];

export interface ActivityEvent {
  id: string;
  icon: string;
  who: string;
  action: string;
  target: string;
  /** If true, target is not a repo link. */
  noLink?: boolean;
  ref: string;
  time: string;
  fail?: boolean;
}

export const ACTIVITY_EVENTS: ActivityEvent[] = [
  {
    id: "a1",
    icon: "push",
    who: "Brxj19",
    action: "pushed 2 changesets to",
    target: "sigma-reckitt",
    ref: "default",
    time: "17h",
  },
  {
    id: "a2",
    icon: "pull",
    who: "Tatwa Prasad",
    action: "cloned",
    target: "sigma-reckitt",
    ref: "over SSH",
    time: "16h",
  },
  {
    id: "a3",
    icon: "lock",
    who: "Brxj19",
    action: "granted write access on",
    target: "payments-api",
    ref: "to Bhuvnesh Kumar",
    time: "1d",
  },
  {
    id: "a4",
    icon: "key",
    who: "Brxj19",
    action: "added SSH key",
    target: "MacBook Pro",
    noLink: true,
    ref: "ed25519",
    time: "2d",
  },
  {
    id: "a5",
    icon: "push",
    who: "Bhuvnesh Kumar",
    action: "pushed 5 changesets to",
    target: "payments-api",
    ref: "feature/refunds",
    time: "2d",
  },
  {
    id: "a6",
    icon: "x",
    who: "Kushwah Dheeraj",
    action: "push rejected on",
    target: "infra-scripts",
    ref: "repository still provisioning",
    time: "5d",
    fail: true,
  },
  {
    id: "a7",
    icon: "hook",
    who: "system",
    action: "webhook delivery failed for",
    target: "payments-api",
    ref: "HTTP 502 from ci.sigma.dev",
    time: "5d",
    fail: true,
  },
  {
    id: "a8",
    icon: "archive",
    who: "Brxj19",
    action: "archived",
    target: "legacy-billing",
    ref: "",
    time: "3w",
  },
];
