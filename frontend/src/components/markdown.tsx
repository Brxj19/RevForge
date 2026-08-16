import { Fragment, useMemo, type ReactNode } from "react";
import clsx from "clsx";

type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "link"; children: InlineNode[]; href: string };

type MarkdownBlock =
  | { type: "heading"; level: number; inline: InlineNode[] }
  | { type: "paragraph"; inline: InlineNode[] }
  | { type: "blockquote"; blocks: MarkdownBlock[] }
  | {
      type: "list";
      ordered: boolean;
      start: number;
      items: Array<{ checked: boolean | null; inline: InlineNode[] }>;
    }
  | {
      type: "table";
      header: InlineNode[][];
      alignments: Array<"left" | "center" | "right">;
      rows: InlineNode[][][];
    }
  | { type: "code"; language: string | null; code: string }
  | { type: "hr" };

interface MarkdownRendererProps {
  content: string;
  className?: string;
  headingIdPrefix?: string;
}

function extractPlainText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.value;
        case "strong":
        case "em":
        case "strike":
        case "link":
          return extractPlainText(node.children);
      }
    })
    .join("");
}

function slugifyHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const inlinePattern =
  /(`[^`]+`|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;

function parseInlineContent(text: string): InlineNode[] {
  if (!text) {
    return [{ type: "text", value: "" }];
  }

  const parts = text.split(inlinePattern);
  return parts
    .filter((part) => part !== "")
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return { type: "code", value: part.slice(1, -1) };
      }

      if (part.startsWith("***") && part.endsWith("***")) {
        return {
          type: "strong",
          children: [
            { type: "em", children: parseInlineContent(part.slice(3, -3)) },
          ],
        };
      }

      if (part.startsWith("**") && part.endsWith("**")) {
        return {
          type: "strong",
          children: parseInlineContent(part.slice(2, -2)),
        };
      }

      if (part.startsWith("*") && part.endsWith("*")) {
        return { type: "em", children: parseInlineContent(part.slice(1, -1)) };
      }

      if (part.startsWith("~~") && part.endsWith("~~")) {
        return {
          type: "strike",
          children: parseInlineContent(part.slice(2, -2)),
        };
      }

      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return {
          type: "link",
          href: linkMatch[2],
          children: parseInlineContent(linkMatch[1]),
        };
      }

      return { type: "text", value: part };
    });
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let currentCell = "";
  let escaped = false;

  for (const character of trimmed) {
    if (escaped) {
      currentCell += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "|") {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
}

function parseTableAlignments(separatorRow: string) {
  return splitTableRow(separatorRow).map((cell) => {
    const normalized = cell.trim();
    if (normalized.startsWith(":") && normalized.endsWith(":")) return "center";
    if (normalized.startsWith(":")) return "left";
    if (normalized.endsWith(":")) return "right";
    return "left";
  }) as Array<"left" | "center" | "right">;
}

function isTableSeparator(line: string) {
  const cells = splitTableRow(line);
  return (
    cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
  );
}

function startsNewBlock(lines: string[], index: number) {
  const currentLine = lines[index]?.trim() ?? "";
  const nextLine = lines[index + 1]?.trim() ?? "";

  if (!currentLine) return true;
  if (currentLine.startsWith("```") || currentLine.startsWith("~~~"))
    return true;
  if (/^(#{1,6})\s+/.test(currentLine)) return true;
  if (/^(?:[-*_]\s*){3,}$/.test(currentLine)) return true;
  if (currentLine.startsWith(">")) return true;
  if (/^(?:[-*+]\s+|\d+\.\s+)/.test(currentLine)) return true;
  if (currentLine.includes("|") && isTableSeparator(nextLine)) return true;

  return false;
}

function parseMarkdownBlocks(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      lineIndex += 1;
      continue;
    }

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const fence = trimmed.slice(0, 3);
      const language = trimmed.slice(3).trim() || null;
      const codeLines: string[] = [];
      lineIndex += 1;

      while (lineIndex < lines.length) {
        const codeLine = lines[lineIndex] ?? "";
        if (codeLine.trim().startsWith(fence)) {
          break;
        }
        codeLines.push(codeLine);
        lineIndex += 1;
      }

      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      lineIndex += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        inline: parseInlineContent(headingMatch[2]),
      });
      lineIndex += 1;
      continue;
    }

    if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      lineIndex += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (lineIndex < lines.length) {
        const quoteLine = lines[lineIndex] ?? "";
        if (!quoteLine.trim().startsWith(">")) {
          break;
        }
        quoteLines.push(quoteLine.replace(/^>\s?/, ""));
        lineIndex += 1;
      }
      blocks.push({
        type: "blockquote",
        blocks: parseMarkdownBlocks(quoteLines),
      });
      continue;
    }

    const tableRows: string[] = [];
    if (
      lineIndex + 1 < lines.length &&
      trimmed.includes("|") &&
      isTableSeparator(lines[lineIndex + 1]?.trim() ?? "")
    ) {
      tableRows.push(line);
      tableRows.push(lines[lineIndex + 1] ?? "");
      lineIndex += 2;

      while (lineIndex < lines.length) {
        const tableLine = lines[lineIndex] ?? "";
        if (!tableLine.trim() || !tableLine.includes("|")) {
          break;
        }
        tableRows.push(tableLine);
        lineIndex += 1;
      }

      const headerCells = splitTableRow(tableRows[0] ?? "");
      const alignments = parseTableAlignments(tableRows[1] ?? "");
      const tableBodyRows = tableRows
        .slice(2)
        .map((rowLine) =>
          splitTableRow(rowLine).map((cell) => parseInlineContent(cell)),
        );

      blocks.push({
        type: "table",
        header: headerCells.map((cell) => parseInlineContent(cell)),
        alignments,
        rows: tableBodyRows.map((row) => row.map((cell) => cell)),
      });
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch);
      const start = orderedMatch ? Number(orderedMatch[1]) : 1;
      const items: Array<{ checked: boolean | null; inline: InlineNode[] }> =
        [];

      while (lineIndex < lines.length) {
        const listLine = lines[lineIndex] ?? "";
        const listTrimmed = listLine.trim();
        const itemMatch = orderedMatch
          ? listTrimmed.match(/^(\d+)\.\s+(.*)$/)
          : listTrimmed.match(/^[-*+]\s+(.*)$/);

        if (!itemMatch) {
          break;
        }

        const rawContent = orderedMatch ? itemMatch[2] : itemMatch[1];
        const taskMatch = rawContent.match(/^\[( |x|X)\]\s+(.*)$/);

        items.push({
          checked: taskMatch ? taskMatch[1].toLowerCase() === "x" : null,
          inline: parseInlineContent(taskMatch ? taskMatch[2] : rawContent),
        });
        lineIndex += 1;
      }

      blocks.push({
        type: "list",
        ordered,
        start,
        items,
      });
      continue;
    }

    const paragraphLines = [trimmed];
    lineIndex += 1;

    while (
      lineIndex < lines.length &&
      lines[lineIndex] !== undefined &&
      lines[lineIndex].trim() &&
      !startsNewBlock(lines, lineIndex)
    ) {
      paragraphLines.push(lines[lineIndex].trim());
      lineIndex += 1;
    }

    blocks.push({
      type: "paragraph",
      inline: parseInlineContent(paragraphLines.join(" ")),
    });
  }

  return blocks;
}

function isSafeLink(href: string) {
  const schemeMatch = href.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch) {
    return ["http", "https", "mailto"].includes(schemeMatch[1].toLowerCase());
  }

  return !/\s/.test(href);
}

function renderInlineNodes(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, index) => {
    const key = `${node.type}-${index}`;

    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "code":
        return (
          <code
            key={key}
            className="rounded-sm bg-surface-subtle px-1.5 py-0.5 font-mono text-[0.95em] text-accent"
          >
            {node.value}
          </code>
        );
      case "strong":
        return <strong key={key}>{renderInlineNodes(node.children)}</strong>;
      case "em":
        return <em key={key}>{renderInlineNodes(node.children)}</em>;
      case "strike":
        return <s key={key}>{renderInlineNodes(node.children)}</s>;
      case "link":
        return (
          <a
            key={key}
            className="text-accent underline decoration-accent underline-offset-2 hover:decoration-accent"
            href={isSafeLink(node.href) ? node.href : "#"}
            rel="noreferrer"
            target="_blank"
          >
            {renderInlineNodes(node.children)}
          </a>
        );
    }
  });
}

function renderBlock(
  block: MarkdownBlock,
  index: number,
  headingIdPrefix?: string,
): ReactNode {
  const key = `${block.type}-${index}`;

  switch (block.type) {
    case "heading": {
      const headingClassName =
        block.level === 1
          ? "text-3xl"
          : block.level === 2
            ? "text-2xl"
            : block.level === 3
              ? "text-xl"
              : block.level === 4
                ? "text-lg"
                : "text-base";

      const headingContent = renderInlineNodes(block.inline);
      const headingLabel = extractPlainText(block.inline);
      const headingId =
        headingIdPrefix && block.level >= 2
          ? `${headingIdPrefix}-${slugifyHeading(headingLabel) || "section"}-${index}`
          : undefined;
      if (block.level === 1) {
        return (
          <h1
            key={key}
            id={headingId}
            className={clsx(
              "font-semibold tracking-[-0.02em] text-text-primary",
              headingClassName,
            )}
          >
            {headingContent}
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2
            key={key}
            id={headingId}
            className={clsx(
              "font-semibold tracking-[-0.02em] text-text-primary",
              headingClassName,
            )}
          >
            {headingContent}
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3
            key={key}
            id={headingId}
            className={clsx(
              "font-semibold tracking-[-0.02em] text-text-primary",
              headingClassName,
            )}
          >
            {headingContent}
          </h3>
        );
      }
      if (block.level === 4) {
        return (
          <h4
            key={key}
            id={headingId}
            className={clsx(
              "font-semibold tracking-[-0.02em] text-text-primary",
              headingClassName,
            )}
          >
            {headingContent}
          </h4>
        );
      }
      if (block.level === 5) {
        return (
          <h5
            key={key}
            id={headingId}
            className={clsx(
              "font-semibold tracking-[-0.02em] text-text-primary",
              headingClassName,
            )}
          >
            {headingContent}
          </h5>
        );
      }
      return (
        <h6
          key={key}
          id={headingId}
          className={clsx(
            "font-semibold tracking-[-0.02em] text-text-primary",
            headingClassName,
          )}
        >
          {headingContent}
        </h6>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="text-sm leading-7 text-text-primary">
          {renderInlineNodes(block.inline)}
        </p>
      );
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-accent-border bg-accent-subtle px-4 py-3"
        >
          <div className="grid gap-3 text-sm leading-7 text-text-secondary">
            {block.blocks.map((childBlock, childIndex) =>
              renderBlock(childBlock, childIndex, headingIdPrefix),
            )}
          </div>
        </blockquote>
      );
    case "list": {
      if (block.ordered) {
        return (
          <ol
            key={key}
            className="ml-6 grid list-decimal gap-2 text-sm leading-7 text-text-primary"
            start={block.start}
          >
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`} className="pl-1">
                <span className="inline-flex items-start gap-2">
                  {item.checked !== null ? (
                    <input
                      aria-hidden="true"
                      checked={item.checked}
                      className="mt-1 h-3.5 w-3.5 shrink-0"
                      disabled
                      readOnly
                      style={{ accentColor: "var(--color-accent)" }}
                      type="checkbox"
                    />
                  ) : null}
                  <span>{renderInlineNodes(item.inline)}</span>
                </span>
              </li>
            ))}
          </ol>
        );
      }

      return (
        <ul
          key={key}
          className="ml-5 grid list-disc gap-2 text-sm leading-7 text-text-primary"
        >
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`} className="pl-1">
              <span className="inline-flex items-start gap-2">
                {item.checked !== null ? (
                  <input
                    aria-hidden="true"
                    checked={item.checked}
                    className="mt-1 h-3.5 w-3.5 shrink-0"
                    disabled
                    readOnly
                    style={{ accentColor: "var(--color-accent)" }}
                    type="checkbox"
                  />
                ) : null}
                <span>{renderInlineNodes(item.inline)}</span>
              </span>
            </li>
          ))}
        </ul>
      );
    }
    case "table":
      return (
        <div key={key} className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                {block.header.map((headerCell, headerIndex) => (
                  <th
                    key={`${key}-header-${headerIndex}`}
                    className={clsx(
                      "border-b border-border px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted",
                      block.alignments[headerIndex] === "center" &&
                        "text-center",
                      block.alignments[headerIndex] === "right" && "text-right",
                    )}
                  >
                    {renderInlineNodes(headerCell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={`${key}-row-${rowIndex}`}
                  className="border-b border-border-muted hover:bg-accent-subtle"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${key}-cell-${rowIndex}-${cellIndex}`}
                      className={clsx(
                        "border-b border-border-muted px-3 py-2 align-top text-text-primary",
                        block.alignments[cellIndex] === "center" &&
                          "text-center",
                        block.alignments[cellIndex] === "right" && "text-right",
                      )}
                    >
                      {renderInlineNodes(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <div
          key={key}
          className="overflow-hidden border border-border bg-editor text-text-primary"
        >
          {block.language ? (
            <div className="border-b border-border-muted bg-surface-subtle px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">
              {block.language}
            </div>
          ) : null}
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6">
            <code>{block.code}</code>
          </pre>
        </div>
      );
    case "hr":
      return <hr key={key} className="border-border-muted" />;
  }
}

export function MarkdownRenderer({
  content,
  className,
  headingIdPrefix,
}: MarkdownRendererProps) {
  const blocks = useMemo(
    () => parseMarkdownBlocks(content.split(/\r?\n/)),
    [content],
  );

  return (
    <div className={clsx("grid gap-4", className)}>
      {blocks.map((block, index) => renderBlock(block, index, headingIdPrefix))}
    </div>
  );
}
