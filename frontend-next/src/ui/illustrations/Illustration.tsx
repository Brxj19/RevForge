import { splitProps, type JSX } from "solid-js";
import { artOf, GLY, IL, type Glyph, type IllustrationId } from "./art";
import "./illustration.css";

export interface IllustrationProps extends Omit<
  JSX.SvgSVGAttributes<SVGSVGElement>,
  "width" | "height"
> {
  id: IllustrationId;
  /** Width in px; height follows the 200×140 canvas. Inline 96 · card 140 · page 200 (DESIGN.md §4). */
  size?: number;
  /** Accessible label; defaults to the illustration's title. Pass "" when the title is visible nearby. */
  label?: string;
}

export function Illustration(props: IllustrationProps) {
  const [local, rest] = splitProps(props, ["id", "size", "label", "class"]);
  const width = () => local.size ?? 160;
  const label = () => local.label ?? artOf(local.id).title;
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
      innerHTML={artOf(local.id).draw()}
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
