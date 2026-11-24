import { splitProps, type JSX } from "solid-js";
import { artOf, drawArt, GLY, IL, type Glyph, type IllustrationId } from "./art";
import "./illustration.css";

/** Canonical illustration widths in px (DESIGN.md §4). Height follows the 200×140 canvas (0.7 ratio). */
export const ILLUSTRATION_SIZES = {
  inline: 96,
  card: 140,
  page: 200,
} as const;

export type IllustrationSize = keyof typeof ILLUSTRATION_SIZES;

export function resolveIllustrationSize(
  size?: IllustrationSize | number,
): number {
  if (typeof size === "number") return size;
  return ILLUSTRATION_SIZES[size ?? "card"];
}

export interface IllustrationProps extends Omit<
  JSX.SvgSVGAttributes<SVGSVGElement>,
  "width" | "height"
> {
  id: IllustrationId;
  /** Semantic size token ("inline" 96px · "card" 140px · "page" 200px) or explicit width in px. Defaults to "card". */
  size?: IllustrationSize | number;
  /** Accessible label; defaults to the illustration's title. Pass "" or `decorative` when the title is visible nearby. */
  label?: string;
  /** Marks the SVG as purely decorative (`aria-hidden="true"`), ignoring any title fallback. */
  decorative?: boolean;
}

export function Illustration(props: IllustrationProps) {
  const [local, rest] = splitProps(props, [
    "id",
    "size",
    "label",
    "decorative",
    "class",
  ]);
  const width = () => resolveIllustrationSize(local.size);
  const label = () =>
    local.decorative ? "" : (local.label ?? artOf(local.id).title);
  return (
    <svg
      class={local.class ? `il ${local.class}` : "il"}
      viewBox="0 0 200 140"
      width={width()}
      height={Math.round(width() * 0.7)}
      role={label() ? "img" : undefined}
      aria-label={label() || undefined}
      aria-hidden={label() ? undefined : "true"}
      data-illustration={local.id}
      {...rest}
      innerHTML={drawArt(local.id)}
    />
  );
}

/**
 * Shared radial gradients referenced by every illustration (url(#ilGlow), url(#ilFloor)).
 * Render once near the app root.
 */
export function IllustrationDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ilGlow">
          <stop
            offset="0"
            style={{ "stop-color": "var(--accent)", "stop-opacity": 0.16 }}
          />
          <stop
            offset="1"
            style={{ "stop-color": "var(--accent)", "stop-opacity": 0 }}
          />
        </radialGradient>
        <radialGradient id="ilFloor">
          <stop offset="0" stop-color="#fff" stop-opacity=".07" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** Row of the status badges illustrations use (illustration kit). */
export function GlyphBadges() {
  const glyphs = Object.keys(GLY) as Glyph[];
  const tone = (g: Glyph) =>
    g === "x"
      ? "rd"
      : g === "check"
        ? "gr"
        : g === "clock" || g === "bang"
          ? "am"
          : "ac";
  return (
    <svg
      class="il"
      viewBox={`0 0 ${glyphs.length * 30} 30`}
      width={glyphs.length * 30}
      height="30"
      aria-hidden="true"
      innerHTML={glyphs
        .map((g, i) => IL.badge(15 + i * 30, 15, 9, g, tone(g)))
        .join("")}
    />
  );
}
