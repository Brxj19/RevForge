import { artOf, type IllustrationId } from "./art";
import css from "./illustration.css?raw";

/** Self-contained SVG with inlined styles and gradients, for the kit's "Copy SVG". */
export function illustrationStandaloneSvg(
  id: IllustrationId,
  root: Element = document.documentElement,
): string {
  const cs = getComputedStyle(root);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const accent = v("--accent");
  const inlined = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/var\(--(accent|green|amber|red|purple)\)/g, (_m, name: string) =>
      v(`--${name}`),
    )
    .replace(/var\(--display\)/g, '"Departure Mono",monospace')
    .replace(/\.il /g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140" width="200" height="140"><defs><radialGradient id="ilGlow"><stop offset="0" stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><radialGradient id="ilFloor"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><style>${inlined}</style>${artOf(id).draw()}</svg>`;
}
