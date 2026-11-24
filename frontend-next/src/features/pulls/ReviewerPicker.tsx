import { createQuery } from "@tanstack/solid-query";
import {
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { pullsApi } from "~/lib/api";
import { Avatar } from "~/ui/Avatar";
import { EmptyState, ErrorState } from "~/ui/EmptyState";
import { Input } from "~/ui/Field";
import { SkeletonText } from "~/ui/Skeleton";
import { Icon } from "~/ui/icons";
import styles from "./pulls.module.css";

/** A repository-scoped, keyboard-operable multiple reviewer selector. */
export function ReviewerPicker(props: {
  org: string;
  repo: string;
  enabled: boolean;
  disabled?: boolean;
  excluded: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = createSignal("");
  const [index, setIndex] = createSignal(0);
  const [keyboardFocus, setKeyboardFocus] = createSignal(false);
  const listId = createUniqueId();
  onMount(() => {
    const keyboard = () => setKeyboardFocus(true);
    const pointer = () => setKeyboardFocus(false);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    onCleanup(() => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
    });
  });
  const candidates = createQuery(() => ({
    queryKey: ["reviewer-candidates", props.org, props.repo],
    queryFn: () => pullsApi.reviewerCandidates(props.org, props.repo),
    enabled: props.enabled,
  }));
  const options = () =>
    (candidates.data?.users ?? []).filter((user) => {
      const query = search().trim().toLocaleLowerCase();
      return (
        !props.excluded.includes(user.id) &&
        !props.selected.includes(user.id) &&
        (!query ||
          `${user.display_name ?? ""} ${user.email}`
            .toLocaleLowerCase()
            .includes(query))
      );
    });
  return (
    <div class={styles.picker} data-keyboard={keyboardFocus() || undefined}>
      <Show when={props.selected.length > 0}>
        <div class={styles.pickerChips} aria-label="Selected reviewers">
          <For
            each={candidates.data?.users.filter((user) =>
              props.selected.includes(user.id),
            )}
          >
            {(user) => (
              <span class={styles.pickerChip}>
                <Avatar
                  name={user.display_name || user.email}
                  size={18}
                  decorative
                />
                {user.display_name || user.email}
                <button
                  type="button"
                  disabled={props.disabled}
                  aria-label={`Remove ${user.display_name || user.email}`}
                  onClick={() =>
                    props.onChange(
                      props.selected.filter((id) => id !== user.id),
                    )
                  }
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>
      <Input
        aria-label="Search people"
        placeholder={`Search ${props.org} members`}
        class={styles.pickerInput}
        disabled={!props.enabled || props.disabled}
        value={search()}
        role="combobox"
        aria-expanded={candidates.isSuccess}
        aria-controls={listId}
        aria-activedescendant={
          options().length
            ? `${listId}-${Math.min(index(), options().length - 1)}`
            : undefined
        }
        onInput={(event) => {
          setSearch(event.currentTarget.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((current) =>
              Math.max(
                0,
                Math.min(
                  options().length - 1,
                  current + (event.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          } else if (event.key === "Enter" && options().length) {
            event.preventDefault();
            const candidate =
              options()[Math.min(index(), options().length - 1)];
            if (candidate) {
              props.onChange([...props.selected, candidate.id]);
              setSearch("");
              setIndex(0);
            }
          }
        }}
      />
      <Show when={props.enabled && candidates.isPending}>
        <div style={{ padding: "12px" }}>
          <SkeletonText lines={["65%", "50%", "75%"]} label="Loading people" />
        </div>
      </Show>
      <Show when={candidates.isError}>
        <div role="alert">
          <ErrorState
            error={candidates.error}
            what="reviewers"
            size="inline"
            compact
            level={3}
            onRetry={() => void candidates.refetch()}
          />
        </div>
      </Show>
      <Show when={candidates.isSuccess}>
        <div
          class={styles.pickerList}
          role="listbox"
          id={listId}
          aria-multiselectable="true"
          aria-label="Available reviewers"
        >
          <Show when={!search().trim() && options().length > 0}>
            <div class={styles.pickerHeading} role="presentation">
              Suggested
            </div>
          </Show>
          <For
            each={options()}
            fallback={
              <EmptyState
                art="no-results"
                size="inline"
                compact
                level={3}
                title="No people match"
                body={`Only ${props.org} members with repository access can be added as reviewers.`}
              />
            }
          >
            {(user, position) => (
              <button
                type="button"
                role="option"
                aria-selected="false"
                id={`${listId}-${position()}`}
                class={styles.pickerOption}
                data-active={
                  position() === Math.min(index(), options().length - 1) ||
                  undefined
                }
                disabled={props.disabled}
                onClick={() => {
                  props.onChange([...props.selected, user.id]);
                  setSearch("");
                  setIndex(0);
                }}
              >
                <Avatar
                  name={user.display_name || user.email}
                  size={30}
                  decorative
                />
                <span>
                  <span>{user.display_name || user.email}</span>
                  <small>{user.email}</small>
                </span>
                <span class={styles.pickerStatus}>Can review</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
