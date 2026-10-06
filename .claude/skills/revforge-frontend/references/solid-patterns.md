# Solid 1.9 patterns for RevForge

Solid looks like React but runs differently: **components run once**; only reactive expressions (signals, memos, JSX expressions, effects) re-run. Most bugs come from React habits.

## 1. Rules

1. **Never destructure props.** `props.title`, not `({ title })`. To split or default props use `splitProps` / `mergeProps`.
2. **Read signals inside tracking scopes** (JSX, `createMemo`, `createEffect`, query option functions). Reading `count()` in the component body runs once and never updates.
3. **Derived values are functions or memos:** `const total = () => a() + b()` (cheap) or `createMemo(() => expensive())`. No `useMemo` dependency arrays.
4. **Control flow components:** `<Show when={x()} fallback={…}>`, `<For each={list()}>` (keyed by reference), `<Index>` (keyed by position, for primitive arrays), `<Switch>/<Match>`, `<Dynamic>`. Don't `.map()` in JSX for lists that change.
5. **Effects are for side effects only** (DOM APIs, CodeMirror, analytics). Don't set signals from effects to "sync" state — derive it.
6. **Cleanup** with `onCleanup` (listeners, CodeMirror `view.destroy()`, observers). `onMount` for one-time DOM work.
7. **Refs:** `let el!: HTMLDivElement; <div ref={el}>` — available in `onMount`.
8. **Stores** (`createStore`) for nested local state (editor folds, people-picker chips, multi-select). Update with path syntax or `produce`. Use `reconcile` when replacing from server data.
9. **Context** only for app-wide services: auth, query client, toaster, palette registry, keyboard scope, hover-card controller.
10. **Async data = Solid Query**, not `createResource`, so caching/invalidations are uniform. Wrap pages in `<Suspense>` only when you use `query.data` without checking `isPending`; prefer explicit `<Switch>` over pending/error/success so every state renders the designed component.
11. **Event handlers:** `onClick` (delegated) or `on:click` (native). Use `on:` for events that must not be delegated (e.g. `scroll`, `wheel` with `{passive}`).
12. **Class lists:** `classList={{ [styles.selected]: selected() }}` + `class={styles.row}`.
13. **Lazy routes:** `const History = lazy(() => import('../features/history/HistoryPage'))`.
14. **Don't** spread reactive objects into plain objects (`{...props}` loses reactivity unless passed straight to a JSX element).

## 2. React → Solid translation

| React | Solid 1.9 |
|---|---|
| `useState(x)` | `const [v, setV] = createSignal(x)`; read `v()` |
| `useMemo(fn, deps)` | `createMemo(fn)` |
| `useEffect(fn, deps)` | `createEffect(fn)` (tracks automatically) / `onMount` / `on(dep, fn, {defer:true})` |
| `useRef` | `let el!: T` + `ref={el}`; mutable non-reactive value → plain `let` |
| `useCallback` | not needed |
| `useContext` | `useContext` (same) |
| `{cond && <X/>}` | `<Show when={cond()}><X/></Show>` |
| `list.map(i => <Row/>)` | `<For each={list()}>{(i) => <Row item={i} />}</For>` |
| `key` prop | not needed (`For` keys by reference) |
| `className` | `class` |
| `htmlFor` | `for` |
| `dangerouslySetInnerHTML` | `innerHTML` — **forbidden for repo/user content** |
| `useNavigate`, `useParams`, `useSearchParams` (react-router) | same names from `@solidjs/router`; params are reactive proxies: `params.org` inside tracking scopes |
| `<Link to>` | `<A href>` (adds active class) |
| `useQuery({…})` | `createQuery(() => ({…}))` |
| `useMutation` | `createMutation(() => ({…}))` |
| `React.lazy` | `lazy` from `solid-js` |
| `forwardRef` | not needed: accept `ref` in props and pass it down (`ref={props.ref}`) |
| `children` prop as function | use `children()` helper from `solid-js` to resolve once |

## 3. Snippets

### Props with defaults and pass-through
```tsx
export function Button(props: ButtonProps) {
  const merged = mergeProps({ variant: 'secondary', size: 'md' } as const, props);
  const [local, rest] = splitProps(merged, ['variant', 'size', 'loading', 'children']);
  return (
    <button {...rest} class={styles.root} data-variant={local.variant} data-size={local.size}
      disabled={rest.disabled || local.loading} aria-busy={local.loading || undefined}>
      <Show when={local.loading}><span class={styles.spin} aria-hidden="true" /></Show>
      {local.children}
    </button>
  );
}
```

### Page with query states
```tsx
export default function HistoryPage() {
  const params = useParams<{ org: string; repo: string }>();
  const [url, setUrl] = useUrlState({ branch: '', q: '', path: '', view: 'graph' as const });
  const history = createHistoryQuery(() => params.org, () => params.repo, () => ({ ...url }));
  return (
    <Switch>
      <Match when={history.isPending}><HistorySkeleton /></Match>
      <Match when={history.isError}><ErrorState error={history.error} /></Match>
      <Match when={history.data?.pages[0].items.length === 0}>
        <EmptyState art="no-changesets-match" title="No changesets match" … />
      </Match>
      <Match when={history.data}>{(data) => <HistoryList pages={data().pages} … />}</Match>
    </Switch>
  );
}
```

### Debounced URL filter (F5)
```tsx
<Input value={url.q} onInput={(e) => setUrl({ q: e.currentTarget.value }, { replace: true, debounce: 250 })} />
```

### Third-party DOM library (CodeMirror)
```tsx
let host!: HTMLDivElement; let view: EditorView | undefined;
onMount(() => { view = new EditorView({ state: makeState(props.doc, props.lang), parent: host }); });
createEffect(on(() => [props.doc, props.lang] as const, ([doc, lang]) => {
  view?.setState(makeState(doc, lang));
}, { defer: true }));
onCleanup(() => view?.destroy());
return <div ref={host} class={styles.editor} />;
```

## 4. Common bugs to check in review

- Props destructured in the signature or in the body.
- `const x = props.value` at top of component, then used in JSX (stale).
- `createEffect` that writes a signal derived from other signals (use a memo).
- `.map` in JSX over a signal list (re-creates every row).
- Query options passed as an object instead of a function.
- Missing `onCleanup` for `addEventListener`, `ResizeObserver`, timers.
- Using `innerHTML` for Markdown output without the sanitising renderer.
