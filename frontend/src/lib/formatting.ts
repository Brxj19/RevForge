export function formatAbsoluteTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatShortTime(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function formatBytes(value: number | null | undefined): string {
  if (value == null) return "Size unknown";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function firstLine(value: string): string {
  const line = value.split("\n")[0]?.trim();
  return line && line.length > 0 ? line : "(no changeset message)";
}

export function buildCloneUrls(
  organizationSlug: string,
  repositorySlug: string,
): {
  httpsUrl: string;
  sshUrl: string;
  httpsCommand: string;
  sshCommand: string;
} {
  const host = window.location.host;
  const httpsUrl = `https://${host}/hg/${organizationSlug}/${repositorySlug}`;
  const sshUrl = `ssh://hg@${host}/${organizationSlug}/${repositorySlug}`;

  return {
    httpsUrl,
    sshUrl,
    httpsCommand: `hg clone ${httpsUrl}`,
    sshCommand: `hg clone ${sshUrl}`,
  };
}

export function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
