import { createMemo, createSignal, For, Show } from "solid-js";
import { copyText } from "~/lib/clipboard";
import { Button } from "~/ui/Button";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { Dialog } from "~/ui/Dialog";
import { EmptyState } from "~/ui/EmptyState";
import { Pill } from "~/ui/Pill";
import { Segmented } from "~/ui/Segmented";
import { showToast } from "~/ui/Toast";
import { Pane, Panes, Workspace, WsBody } from "~/ui/WorkspaceLayout";
import { Icon } from "~/ui/icons";
import {
  GlyphBadges,
  IL_CATS,
  ILLUSTRATION_IDS,
  Illustration,
  artOf,
  illustrationStandaloneSvg,
  type IllustrationCategory,
  type IllustrationId,
} from "~/ui/illustrations";
import styles from "./dev-ui.module.css";

type Filter = "All" | IllustrationCategory;

/** The illustration kit (prototype #/illustrations): every spot illustration with where it's used. */
export default function IllustrationsPage() {
  const [filter, setFilter] = createSignal<Filter>("All");
  const [preview, setPreview] = createSignal<IllustrationId | null>(null);
  const ids = createMemo(() =>
    ILLUSTRATION_IDS.filter(
      (id) => filter() === "All" || artOf(id).cat === filter(),
    ),
  );
  const count = (c: Filter) =>
    c === "All"
      ? ILLUSTRATION_IDS.length
      : ILLUSTRATION_IDS.filter((id) => artOf(id).cat === c).length;
  const copySvg = async (id: IllustrationId) => {
    await copyText(illustrationStandaloneSvg(id));
    showToast({ message: "SVG copied" });
  };

  return (
    <Workspace>
      <WsBody>
        <div class={styles.between}>
          <div>
            <h1 class="h1">Illustration kit</h1>
            <p class="lead">
              {ILLUSTRATION_IDS.length} spot illustrations for every empty,
              status and error state. Each is built from the same primitives and
              follows the accent colour.
            </p>
          </div>
          <Segmented
            label="Category"
            value={filter()}
            onChange={setFilter}
            options={(["All", ...IL_CATS] as Filter[]).map((c) => ({
              value: c,
              label: c,
              count: count(c),
            }))}
          />
        </div>
        <Panes columns="minmax(0,1fr) 300px">
          <Pane>
            <div class={styles.illGrid}>
              <For each={ids()}>
                {(id) => (
                  <Card as="article" class={styles.illCard}>
                    <button
                      type="button"
                      class={styles.illArt}
                      onClick={() => setPreview(id)}
                      aria-label={`Preview ${artOf(id).title}`}
                    >
                      <Illustration id={id} size={180} label="" />
                    </button>
                    <div class={styles.illMeta}>
                      <div class={styles.between}>
                        <span class="h3">{artOf(id).title}</span>
                        <Pill>{artOf(id).cat}</Pill>
                      </div>
                      <code class="muted">{id}</code>
                      <p>{artOf(id).used}</p>
                      <div class={styles.row}>
                        <Button size="sm" onClick={() => setPreview(id)}>
                          <Icon name="eye" size={13} />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void copySvg(id)}
                        >
                          <Icon name="copy" size={13} />
                          Copy SVG
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </For>
            </div>
          </Pane>
          <Pane as="aside">
            <Card>
              <CardHeader>
                <h2 class="h3">How they're built</h2>
              </CardHeader>
              <CardBody class={styles.how}>
                <p>
                  One 200 × 140 canvas. A soft accent glow sits behind the
                  subject and a faint floor ellipse grounds it. Objects are flat
                  panels with a 1px edge; anything missing is drawn dashed.
                </p>
                <div>
                  <div class={styles.label}>Status badges</div>
                  <GlyphBadges />
                  <p class="muted">
                    Blue for an action you can take, green for done, amber for
                    waiting, red for failed, grey for locked.
                  </p>
                </div>
                <div>
                  <div class={styles.label}>Sizes</div>
                  <div class={styles.sizes}>
                    <For
                      each={
                        [
                          [96, "Inline"],
                          [140, "Card"],
                          [200, "Page"],
                        ] as const
                      }
                    >
                      {([w, l]) => (
                        <figure class={styles.fig}>
                          <Illustration id="no-repos" size={w * 0.6} label="" />
                          <figcaption>
                            {l} {w}px
                          </figcaption>
                        </figure>
                      )}
                    </For>
                  </div>
                </div>
                <div>
                  <div class={styles.label}>Writing the text</div>
                  <p>
                    Say what's missing in the title, then what to do in one
                    sentence. Errors say what happened and how to fix it,
                    without apologising.
                  </p>
                </div>
              </CardBody>
            </Card>
          </Pane>
        </Panes>
      </WsBody>
      <Show when={preview()}>
        {(id) => (
          <Dialog
            open
            onOpenChange={(o) => !o && setPreview(null)}
            wide
            title={artOf(id()).title}
            description={`${artOf(id()).cat} — used in ${artOf(id()).used}`}
            footer={
              <>
                <Button variant="ghost" onClick={() => void copySvg(id())}>
                  <Icon name="copy" size={14} />
                  Copy SVG
                </Button>
                <Button variant="primary" onClick={() => setPreview(null)}>
                  Done
                </Button>
              </>
            }
          >
            <Card>
              <EmptyState
                art={id()}
                size="page"
                level={3}
                actions={
                  <For each={artOf(id()).acts}>
                    {(t, i) => (
                      <Button variant={i() === 0 ? "primary" : "secondary"}>
                        {t}
                      </Button>
                    )}
                  </For>
                }
              />
            </Card>
            <div class={styles.sizes}>
              <For each={[96, 140]}>
                {(w) => (
                  <figure class={styles.fig}>
                    <Illustration id={id()} size={w} label="" />
                    <figcaption>{w}px</figcaption>
                  </figure>
                )}
              </For>
            </div>
          </Dialog>
        )}
      </Show>
    </Workspace>
  );
}
