import type { ChangesetDetail } from "./api";

export type DiffFileStatus = "A" | "M" | "D" | "R" | "C" | "B";

export interface ParsedDiffLine {
  text: string;
  type: "add" | "remove" | "context";
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface ParsedDiffHunk {
  header: string;
  lines: ParsedDiffLine[];
}

export interface ParsedDiffFile {
  path: string;
  status: DiffFileStatus;
  additions: number | null;
  deletions: number | null;
  oldPath: string | null;
  hunks: ParsedDiffHunk[];
}

export interface DiffFileViewModel {
  path: string;
  status: DiffFileStatus;
  additions: number | null;
  deletions: number | null;
  oldPath: string | null;
  parsed: ParsedDiffFile | null;
}

function statusCodeFromBackendStatus(
  status: ChangesetDetail["changed_files"][number]["status"] | undefined,
): DiffFileStatus {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    default:
      return "M";
  }
}

export function statusLabel(status: DiffFileStatus) {
  switch (status) {
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    case "B":
      return "Binary";
    default:
      return "Modified";
  }
}

export function fileBadgeVariant(status: DiffFileStatus) {
  switch (status) {
    case "A":
      return "success" as const;
    case "D":
      return "danger" as const;
    case "R":
    case "C":
      return "info" as const;
    default:
      return "default" as const;
  }
}

export function formatLineDelta(
  additions: number | null,
  deletions: number | null,
) {
  if (additions !== null && deletions !== null) {
    return `+${additions} -${deletions}`;
  }
  return "Binary or not counted";
}

export function renderLineDelta(
  additions: number | null,
  deletions: number | null,
) {
  if (additions === null || deletions === null) {
    return null;
  }

  return {
    additionsLabel: `+${additions}`,
    deletionsLabel: `-${deletions}`,
  };
}

export function parseChangesetDiff(content: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  let current: ParsedDiffFile | null = null;
  let currentHunk: ParsedDiffHunk | null = null;
  let sawBinaryMarker = false;
  let currentOldLineNumber: number | null = null;
  let currentNewLineNumber: number | null = null;

  for (const line of content.split("\n")) {
    if (line.startsWith("diff -r ") || line.startsWith("diff --git ")) {
      if (current) {
        if (sawBinaryMarker) {
          current.additions = null;
          current.deletions = null;
          current.status = "B";
        }
        files.push(current);
      }
      current = {
        path: "unknown",
        status: "M",
        additions: 0,
        deletions: 0,
        oldPath: null,
        hunks: [],
      };
      if (line.startsWith("diff --git ")) {
        const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
        if (match) {
          current.oldPath = match[1] ?? null;
          current.path = match[2] ?? "unknown";
        }
      }
      currentHunk = null;
      sawBinaryMarker = false;
      currentOldLineNumber = null;
      currentNewLineNumber = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("rename from ")) {
      current.oldPath = line.slice("rename from ".length).trim();
      current.status = "R";
      continue;
    }

    if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length).trim();
      current.status = "R";
      continue;
    }

    if (line.startsWith("copy from ")) {
      current.oldPath = line.slice("copy from ".length).trim();
      current.status = "C";
      continue;
    }

    if (line.startsWith("copy to ")) {
      current.path = line.slice("copy to ".length).trim();
      current.status = "C";
      continue;
    }

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      if (line.endsWith("/dev/null")) {
        if (line.startsWith("--- ")) {
          current.status = "A";
        } else {
          current.status = "D";
        }
        continue;
      }
      const nextPath = line
        .replace(/^(\+\+\+|---)\s+/, "")
        .replace(/^[ab]\//, "")
        .trim();
      if (nextPath && nextPath !== line) {
        current.path = nextPath;
      }
      continue;
    }

    if (line.startsWith("Binary file ") || line.startsWith("GIT binary patch")) {
      sawBinaryMarker = true;
      continue;
    }

    if (line.startsWith("@@")) {
      currentHunk = { header: line, lines: [] };
      current.hunks.push(currentHunk);
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      currentOldLineNumber = match ? Number(match[1]) : null;
      currentNewLineNumber = match ? Number(match[2]) : null;
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (current.additions !== null) {
        current.additions += 1;
      }
      currentHunk.lines.push({
        text: line,
        type: "add",
        oldLineNumber: null,
        newLineNumber: currentNewLineNumber,
      });
      if (currentNewLineNumber !== null) {
        currentNewLineNumber += 1;
      }
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      if (current.deletions !== null) {
        current.deletions += 1;
      }
      currentHunk.lines.push({
        text: line,
        type: "remove",
        oldLineNumber: currentOldLineNumber,
        newLineNumber: null,
      });
      if (currentOldLineNumber !== null) {
        currentOldLineNumber += 1;
      }
      continue;
    }

    currentHunk.lines.push({
      text: line,
      type: "context",
      oldLineNumber: currentOldLineNumber,
      newLineNumber: currentNewLineNumber,
    });
    if (currentOldLineNumber !== null) {
      currentOldLineNumber += 1;
    }
    if (currentNewLineNumber !== null) {
      currentNewLineNumber += 1;
    }
  }

  if (current) {
    if (sawBinaryMarker) {
      current.additions = null;
      current.deletions = null;
      current.status = "B";
    }
    files.push(current);
  }

  return files.filter((file) => file.path !== "unknown");
}

export function buildDiffFileViewModels(
  changeset: Pick<ChangesetDetail, "files_changed" | "changed_files">,
  parsedFiles: ParsedDiffFile[],
): DiffFileViewModel[] {
  const parsedByPath = new Map(parsedFiles.map((file) => [file.path, file]));
  const backendByPath = new Map(
    changeset.changed_files.map((file) => [file.path, file]),
  );
  const orderedPaths: string[] = [];

  for (const file of changeset.changed_files) {
    if (!orderedPaths.includes(file.path)) {
      orderedPaths.push(file.path);
    }
  }

  for (const path of changeset.files_changed) {
    if (!orderedPaths.includes(path)) {
      orderedPaths.push(path);
    }
  }

  for (const file of parsedFiles) {
    if (!orderedPaths.includes(file.path)) {
      orderedPaths.push(file.path);
    }
  }

  return orderedPaths.map((path) => {
    const backend = backendByPath.get(path);
    const parsed = parsedByPath.get(path) ?? null;
    return {
      path,
      status: parsed?.status ?? statusCodeFromBackendStatus(backend?.status),
      additions: backend?.insertions ?? parsed?.additions ?? null,
      deletions: backend?.deletions ?? parsed?.deletions ?? null,
      oldPath: backend?.old_path ?? parsed?.oldPath ?? null,
      parsed,
    };
  });
}
