import { createSignal, Show } from "solid-js";
import { bytes } from "~/lib/format";
import { Button } from "~/ui/Button";
import { EmptyState } from "~/ui/EmptyState";
import { Icon } from "~/ui/icons";
import { Segmented } from "~/ui/Segmented";
import styles from "../code.module.css";

/**
 * Raster image from the same repository's raw endpoint (server serves PNG/JPEG/GIF/WebP inline,
 * nosniff, CSP sandbox). SVG is never shown as an image (it's code).
 */
export function ImagePreview(props: {
  src: string;
  name: string;
  size: number | null;
  onDownload: () => void;
}) {
  const [zoom, setZoom] = createSignal<"fit" | "1x" | "2x">("fit");
  const [bg, setBg] = createSignal<"checker" | "dark" | "light">("checker");
  const [dims, setDims] = createSignal<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = createSignal(false);
  return (
    <Show
      when={!failed()}
      fallback={
        <EmptyState
          art="binary-file"
          title="Image not shown"
          body={`${props.name} couldn't be displayed. Download it or open the raw file instead.`}
          actions={
            <>
              <Button onClick={() => props.onDownload()}>
                <Icon name="down" size={14} />
                Download
              </Button>
              <a
                class="link"
                href={props.src}
                target="_blank"
                rel="noopener noreferrer"
              >
                View raw
              </a>
            </>
          }
        />
      }
    >
      <div class={styles.imgv} data-bg={bg()} data-zoom={zoom()}>
        <img
          src={props.src}
          alt={props.name}
          referrerpolicy="no-referrer"
          style={
            dims() && zoom() !== "fit"
              ? { width: `${(dims()?.w ?? 0) * (zoom() === "2x" ? 2 : 1)}px` }
              : undefined
          }
          onLoad={(e) =>
            setDims({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          onError={() => setFailed(true)}
        />
      </div>
      <div class={styles.imgBar}>
        <Show when={dims()}>
          {(d) => (
            <span>
              {d().w} × {d().h} px
            </span>
          )}
        </Show>
        <Show when={props.size !== null}>
          <span>{bytes(props.size ?? 0)}</span>
        </Show>
        <span class={styles.imgBarRight}>
          Zoom
          <Segmented
            label="Zoom"
            size="sm"
            value={zoom()}
            onChange={setZoom}
            options={[
              { value: "fit", label: "Fit" },
              { value: "1x", label: "100%" },
              { value: "2x", label: "200%" },
            ]}
          />
          Background
          <Segmented
            label="Background"
            size="sm"
            value={bg()}
            onChange={setBg}
            options={[
              { value: "checker", label: "Grid" },
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </span>
      </div>
    </Show>
  );
}
