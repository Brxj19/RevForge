import { createMemo, createSignal, For, type JSX } from "solid-js";
import { Avatar, AvatarStack } from "~/ui/Avatar";
import { Button, ButtonLink } from "~/ui/Button";
import { Callout } from "~/ui/Callout";
import { Card, CardBody, CardHeader } from "~/ui/Card";
import { Checkbox } from "~/ui/Checkbox";
import { Combobox } from "~/ui/Combobox";
import { ConfirmDialog } from "~/ui/ConfirmDialog";
import { CopyButton, CopyLine } from "~/ui/CopyButton";
import { Dialog } from "~/ui/Dialog";
import { ChangeBadge, DiffBar } from "~/ui/DiffStat";
import { EmptyState } from "~/ui/EmptyState";
import { Field, Input, InputGroup, Textarea } from "~/ui/Field";
import { FileTree, type TreeItem } from "~/ui/FileTree";
import { Hash } from "~/ui/Hash";
import { Heatmap } from "~/ui/Heatmap";
import { IconButton } from "~/ui/IconButton";
import { Kbd, Shortcut } from "~/ui/Kbd";
import { Menu } from "~/ui/Menu";
import { Pager } from "~/ui/Pager";
import { Pill } from "~/ui/Pill";
import { Popover } from "~/ui/Popover";
import { Progress } from "~/ui/Progress";
import { RadioGroup } from "~/ui/Radio";
import { Ref } from "~/ui/Ref";
import { Segmented } from "~/ui/Segmented";
import { MultiSelect, Select } from "~/ui/Select";
import { Skeleton, SkeletonText } from "~/ui/Skeleton";
import { Sparkline } from "~/ui/Sparkline";
import { Switch } from "~/ui/Switch";
import { Table, Td, Th, type SortDirection } from "~/ui/Table";
import { TabLinks, Tabs } from "~/ui/Tabs";
import { showToast } from "~/ui/Toast";
import { Tooltip } from "~/ui/Tooltip";
import { Pane, Panes, Workspace, WsBody } from "~/ui/WorkspaceLayout";
import { FileIcon, Icon } from "~/ui/icons";
import { Illustration } from "~/ui/illustrations";
import { IconBrowser } from "./IconBrowser";
import {
  KIT_ICON_NAMES,
  KIT_MEMBERS,
  KIT_SPARKS,
  kitHeatDays,
} from "./kit-data";
import styles from "./dev-ui.module.css";

const SECTIONS = [
  ["k-buttons", "Buttons"],
  ["k-badges", "Badges and refs"],
  ["k-inputs", "Inputs"],
  ["k-dropdowns", "Dropdowns and menus"],
  ["k-toggles", "Toggles, checkboxes, radios"],
  ["k-tabs", "Tabs and segmented"],
  ["k-copy", "Copy and code"],
  ["k-tree", "File tree and popover"],
  ["k-feedback", "Callouts and progress"],
  ["k-states", "Loading, empty, error"],
  ["k-ill", "Illustrations"],
  ["k-overlays", "Dialogs and toasts"],
  ["k-table", "Data table"],
  ["k-people", "Avatars and tooltips"],
  ["k-icons", "File and folder icons"],
  ["k-charts", "Sparklines, heatmap and graph"],
] as const;

function Section(props: { id: string; title: string; children: JSX.Element }) {
  return (
    <Card
      as="section"
      id={props.id}
      class={styles.sec}
      aria-labelledby={`${props.id}-h`}
    >
      <CardHeader>
        <h2 class="h2" id={`${props.id}-h`}>
          {props.title}
        </h2>
      </CardHeader>
      <CardBody>{props.children}</CardBody>
    </Card>
  );
}

const Label = (props: { children: JSX.Element }) => (
  <div class={styles.label}>{props.children}</div>
);
const Row = (props: { children: JSX.Element }) => (
  <div class={styles.row}>{props.children}</div>
);

const KIT_TREE: Record<string, TreeItem[]> = {
  "": [
    { path: "src", name: "src", dir: true },
    { path: "tests", name: "tests", dir: true },
    { path: "CMakeLists.txt", name: "CMakeLists.txt", dir: false },
    { path: "README.md", name: "README.md", dir: false },
  ],
  src: [
    { path: "src/util", name: "util", dir: true },
    {
      path: "src/graph.cpp",
      name: "graph.cpp",
      dir: false,
      status: { label: "M", title: "Modified in this changeset" },
    },
    { path: "src/graph.hpp", name: "graph.hpp", dir: false },
  ],
  "src/util": [{ path: "src/util/log.hpp", name: "log.hpp", dir: false }],
  tests: [{ path: "tests/test_graph.cpp", name: "test_graph.cpp", dir: false }],
};

/** The UI kit (prototype #/ui): every primitive in each of its states. */
export default function UiKitPage() {
  const [active, setActive] = createSignal<string>(SECTIONS[0][0]);
  const [lang, setLang] = createSignal("cpp");
  const [role, setRole] = createSignal("write");
  const [branch, setBranch] = createSignal("default");
  const [events, setEvents] = createSignal<string[]>(["push", "tag"]);
  const [seg, setSeg] = createSignal<"graph" | "list">("graph");
  const [vis, setVis] = createSignal<"all" | "public" | "private">("all");
  const [sshOpen, setSshOpen] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [keyError, setKeyError] = createSignal<string>();
  const [sort, setSort] = createSignal<SortDirection>("ascending");
  const members = createMemo(() => {
    const dir = sort() === "ascending" ? 1 : -1;
    return [...KIT_MEMBERS]
      .sort((a, b) => dir * a.name.localeCompare(b.name))
      .slice(0, 3);
  });
  const heatDays = kitHeatDays(new Date(2026, 9, 5));
  const [treeOpen, setTreeOpen] = createSignal(new Set(["src"]));
  const [treeSel, setTreeSel] = createSignal("src/graph.cpp");

  const jump = (id: string) => {
    setActive(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Workspace>
      <WsBody>
        <div>
          <h1 class="h1">UI kit</h1>
          <p class="lead">
            Every primitive in <code>src/ui</code>, in each of its states.
            Mirrors the prototype's UI kit page.
          </p>
        </div>
        <Panes columns="210px minmax(0,1fr)">
          <Pane
            as="nav"
            aria-label="UI kit sections"
            class={styles.subnav}
            collapseOnNarrow
          >
            <For each={SECTIONS}>
              {([id, label]) => (
                <button
                  type="button"
                  aria-current={active() === id ? "true" : undefined}
                  onClick={() => jump(id)}
                >
                  {label}
                </button>
              )}
            </For>
          </Pane>
          <Pane>
            <div class={styles.stack}>
              <Section id="k-buttons" title="Buttons">
                <Label>Variants</Label>
                <Row>
                  <Button variant="primary">Primary</Button>
                  <Button>Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                  <Button variant="danger-solid">Danger, confirmed</Button>
                </Row>
                <Label>Sizes and states</Label>
                <Row>
                  <Button variant="primary" size="sm">
                    Small
                  </Button>
                  <Button variant="primary">Default</Button>
                  <Button variant="primary" size="lg">
                    Large
                  </Button>
                  <Button variant="primary" disabled>
                    Disabled
                  </Button>
                  <Button loading>Saving</Button>
                  <Button>
                    <Icon name="plus" size={14} />
                    With icon
                  </Button>
                  <ButtonLink href="/dev/illustrations">Link button</ButtonLink>
                </Row>
                <Label>Icon buttons</Label>
                <Row>
                  <IconButton icon="copy" label="Copy" />
                  <IconButton icon="dots" label="More" />
                  <IconButton icon="link" label="Small" size="sm" />
                  <IconButton icon="x" label="Extra small" size="xs" />
                  <IconButton icon="trash" label="Disabled" disabled />
                </Row>
              </Section>

              <Section id="k-badges" title="Badges and refs">
                <Row>
                  <Pill>Neutral</Pill>
                  <Pill tone="green" dot>
                    ready
                  </Pill>
                  <Pill tone="amber" dot>
                    provisioning
                  </Pill>
                  <Pill tone="red" dot>
                    failing
                  </Pill>
                  <Pill tone="blue">admin</Pill>
                  <Pill tone="purple">owner</Pill>
                  <Pill>
                    <Icon name="globe" size={11} />
                    Public
                  </Pill>
                  <Pill>
                    <Icon name="lock" size={11} />
                    Private
                  </Pill>
                </Row>
                <Label>Mercurial refs</Label>
                <Row>
                  <Ref kind="branch" name="default" />
                  <Ref
                    kind="branch"
                    name="feature/data-structures"
                    color="#3fb950"
                  />
                  <Ref kind="bookmark" name="review/graph-api" />
                  <Ref kind="tag" name="v0.1.0" />
                  <Hash
                    node="1c7450e15fcbe499620a42a89b43139ca1ea6aa9"
                    length={8}
                  />
                  <ChangeBadge kind="M" />
                  <ChangeBadge kind="A" />
                  <ChangeBadge kind="D" />
                  <ChangeBadge kind="R" />
                  <ChangeBadge kind="C" />
                  <DiffBar additions={9} deletions={1} />
                </Row>
              </Section>

              <Section id="k-inputs" title="Inputs">
                <div class={styles.grid}>
                  <Field label="Text">
                    <Input placeholder="payments-api" />
                  </Field>
                  <Field label="With prefix">
                    <InputGroup prefix="sigma/" placeholder="repo-name" />
                  </Field>
                  <Field label="Search">
                    <InputGroup
                      prefix={<Icon name="search" size={14} />}
                      suffix={<Kbd>/</Kbd>}
                      placeholder="Filter"
                    />
                  </Field>
                  <Field
                    label="Error"
                    error="That key is too short. Use ed25519 or RSA 3072+."
                  >
                    <Input value="ssh-rsa" />
                  </Field>
                  <Field label="Disabled">
                    <Input value="sigma" disabled />
                  </Field>
                  <Field label="Hint" hint="Appears in every repository URL.">
                    <Input value="sigma" />
                  </Field>
                </div>
                <Field label="Textarea" optional class={styles.mt}>
                  <Textarea placeholder="Describe the repository" />
                </Field>
              </Section>

              <Section id="k-dropdowns" title="Dropdowns and menus">
                <p class={styles.note}>
                  One look for every select and menu: keyboard navigation,
                  type-to-filter, check marks, sections, shortcuts and danger
                  items. Native selects are never used.
                </p>
                <Row>
                  <Select
                    label="Language"
                    value={lang()}
                    onChange={setLang}
                    class={styles.w180}
                    options={[
                      { value: "cpp", label: "C++" },
                      { value: "py", label: "Python" },
                      { value: "go", label: "Go" },
                      { value: "rs", label: "Rust" },
                      { value: "sh", label: "Shell" },
                    ]}
                  />
                  <Combobox
                    label="Branch"
                    value={branch()}
                    onChange={setBranch}
                    lead={<Icon name="branch" size={14} />}
                    class={styles.w220}
                    options={[
                      {
                        label: "Branches",
                        count: 3,
                        items: [
                          {
                            value: "default",
                            label: "default",
                            hint: "1c7450e15fcb  open",
                          },
                          {
                            value: "feature/data-structures",
                            label: "feature/data-structures",
                            hint: "e0c8db2ddfe6  merged",
                          },
                          {
                            value: "feature/data-structures-improvements",
                            label: "feature/data-structures-improvements",
                            hint: "0b486fec60de  merged",
                          },
                        ],
                      },
                      {
                        label: "Bookmarks",
                        count: 1,
                        items: [
                          {
                            value: "review/graph-api",
                            label: "review/graph-api",
                            icon: "bookmark",
                          },
                        ],
                      },
                      {
                        label: "Tags",
                        count: 1,
                        items: [
                          { value: "v0.1.0", label: "v0.1.0", icon: "tag" },
                        ],
                      },
                    ]}
                  />
                  <Select
                    label="Role"
                    size="sm"
                    value={role()}
                    onChange={setRole}
                    class={styles.w130}
                    options={[
                      {
                        value: "read",
                        label: "Read",
                        hint: "Browse and clone",
                      },
                      {
                        value: "write",
                        label: "Write",
                        hint: "Read, plus push changesets",
                      },
                      {
                        value: "admin",
                        label: "Admin",
                        hint: "Write, plus settings and access",
                      },
                    ]}
                  />
                  <MultiSelect
                    label="Events"
                    values={events()}
                    onChange={setEvents}
                    class={styles.w220}
                    summary={(v) =>
                      v.length
                        ? `${v.length} event${v.length > 1 ? "s" : ""}: ${v.join(", ")}`
                        : "No events"
                    }
                    options={[
                      {
                        label: "Send these events",
                        items: [
                          {
                            value: "push",
                            label: "Push",
                            hint: "New changesets arrive",
                          },
                          {
                            value: "tag",
                            label: "Tag",
                            hint: "A tag is created or moved",
                          },
                          {
                            value: "bookmark",
                            label: "Bookmark",
                            hint: "A bookmark moves",
                          },
                          {
                            value: "branch",
                            label: "Branch closed",
                            hint: "A named branch is closed",
                          },
                          {
                            value: "access",
                            label: "Access change",
                            hint: "Someone gains or loses access",
                          },
                        ],
                      },
                    ]}
                  />
                </Row>
                <Label>Menus</Label>
                <Row>
                  <Menu
                    trigger={(p: Record<string, unknown>) => (
                      <Button {...p}>
                        <Icon name="plus" size={14} />
                        New
                        <Icon name="chev" size={13} />
                      </Button>
                    )}
                    groups={[
                      {
                        items: [
                          {
                            label: "Repository",
                            hint: "Empty Mercurial repository",
                            icon: "repo",
                            kbd: "N R",
                          },
                          {
                            label: "Organization",
                            hint: "A new workspace with its own members",
                            icon: "org",
                          },
                          {
                            label: "SSH key",
                            hint: "For this machine",
                            icon: "key",
                          },
                        ],
                      },
                    ]}
                  />
                  <Menu
                    placement="bottom-end"
                    trigger={(p: Record<string, unknown>) => (
                      <IconButton
                        {...p}
                        icon="dots"
                        label="Repository actions"
                        tooltip={false}
                      />
                    )}
                    groups={[
                      {
                        items: [
                          { label: "Open", icon: "ext" },
                          { label: "Copy clone command", icon: "copy" },
                          { label: "Settings", icon: "gear" },
                        ],
                      },
                      {
                        items: [
                          { label: "Archive", icon: "archive", danger: true },
                        ],
                      },
                    ]}
                  />
                  <Menu
                    trigger={(p: Record<string, unknown>) => (
                      <Button {...p}>
                        <Icon name="sort" size={14} />
                        Sort
                      </Button>
                    )}
                    groups={[
                      {
                        label: "Sort by",
                        items: [
                          { label: "Recently updated", checked: true },
                          { label: "Name", checked: false },
                          { label: "Most watched", checked: false },
                        ],
                      },
                    ]}
                  />
                </Row>
              </Section>

              <Section id="k-toggles" title="Toggles, checkboxes, radios">
                <div class={styles.grid}>
                  <div class={styles.col}>
                    <Switch label="SSH enabled" defaultChecked />
                    <Switch label="Anonymous clone" />
                    <Switch
                      label="Require review"
                      disabled
                      disabledReason="Org policy sets this"
                    />
                  </div>
                  <div class={styles.col}>
                    <Checkbox
                      label="Push"
                      description="New changesets arrive"
                      defaultChecked
                    />
                    <Checkbox label="Tag" />
                    <Checkbox label="Partially selected" indeterminate />
                  </div>
                  <RadioGroup
                    label="Access"
                    defaultValue="read"
                    options={[
                      {
                        value: "read",
                        label: "Read",
                        description: "Clone and pull",
                      },
                      {
                        value: "write",
                        label: "Read and write",
                        description: "Clone, pull and push",
                      },
                    ]}
                  />
                </div>
                <Label>Radio cards</Label>
                <RadioGroup
                  label="Visibility"
                  hideLabel
                  variant="card"
                  defaultValue="private"
                  options={[
                    {
                      value: "private",
                      label: "Private",
                      description: "Only people you add can see it.",
                      icon: "lock",
                    },
                    {
                      value: "internal",
                      label: "Internal",
                      description: "Every member of sigma can read it.",
                      icon: "org",
                    },
                    {
                      value: "public",
                      label: "Public",
                      description: "Anyone can read and clone.",
                      lockedReason:
                        "Only organization owners can make repositories public.",
                    },
                  ]}
                />
              </Section>

              <Section id="k-tabs" title="Tabs and segmented">
                <TabLinks
                  label="Example repository tabs"
                  boxed
                  items={[
                    {
                      href: "/dev/ui",
                      label: "Overview",
                      icon: "eye",
                      active: true,
                    },
                    { href: "/dev/ui#code", label: "Code", icon: "file" },
                    {
                      href: "/dev/ui#history",
                      label: "History",
                      icon: "commit",
                      count: 12,
                    },
                  ]}
                />
                <Row>
                  <Segmented
                    label="History view"
                    value={seg()}
                    onChange={setSeg}
                    options={[
                      { value: "graph", label: "Graph", icon: "graph" },
                      { value: "list", label: "List", icon: "list" },
                    ]}
                  />
                  <Segmented
                    label="Visibility filter"
                    value={vis()}
                    onChange={setVis}
                    options={[
                      { value: "all", label: "All", count: 5 },
                      { value: "public", label: "Public" },
                      { value: "private", label: "Private" },
                    ]}
                  />
                </Row>
                <Label>In-page tabs</Label>
                <Tabs
                  label="Comment editor"
                  panels={[
                    {
                      value: "write",
                      label: "Write",
                      content: (
                        <Textarea
                          aria-label="Comment"
                          placeholder="Leave a comment"
                        />
                      ),
                    },
                    {
                      value: "preview",
                      label: "Preview",
                      content: <p class={styles.note}>Nothing to preview.</p>,
                    },
                  ]}
                />
              </Section>

              <Section id="k-copy" title="Copy and code">
                <div class={styles.col}>
                  <CopyLine
                    text="hg clone ssh://hg@revforge.sigma.dev/sigma/sigma-reckitt"
                    label="Copy clone command"
                  />
                  <Row>
                    <Shortcut keys="⌘ K" />
                    <Kbd>esc</Kbd>
                    <code>hg push --new-branch</code>
                    <CopyButton
                      text="hg push --new-branch"
                      label="Copy command"
                    />
                  </Row>
                </div>
              </Section>

              <Section id="k-tree" title="File tree and popover">
                <div class={styles.col}>
                  <Label>
                    FileTree: ↑↓ move, → expand, ← collapse or parent, Enter
                    opens
                  </Label>
                  <FileTree
                    label="Example files"
                    childrenOf={(d) => KIT_TREE[d]}
                    isExpanded={(p) => treeOpen().has(p)}
                    onToggle={(p, open) =>
                      setTreeOpen((s) => {
                        const n = new Set(s);
                        if (open) n.add(p);
                        else n.delete(p);
                        return n;
                      })
                    }
                    onOpen={(it) => setTreeSel(it.path)}
                    selected={treeSel()}
                  />
                  <Label>Popover (clone menu, ref picker)</Label>
                  <Row>
                    <Popover
                      trigger={Button}
                      triggerProps={{ variant: "primary" }}
                      triggerContent="Clone"
                      title="Clone sigma-reckitt"
                      width={420}
                    >
                      <CopyLine
                        text="hg clone ssh://hg@revforge.sigma.dev/sigma/sigma-reckitt"
                        label="Copy clone command"
                      />
                    </Popover>
                  </Row>
                </div>
              </Section>

              <Section id="k-feedback" title="Callouts and progress">
                <div class={styles.col}>
                  <Callout tone="info" title="Heads up">
                    The graph hides while filters are on.
                  </Callout>
                  <Callout tone="ok" title="Push accepted">
                    2 changesets on default.
                  </Callout>
                  <Callout tone="warn" title="You won't see this token again">
                    Copy it before closing.
                  </Callout>
                  <Callout
                    tone="err"
                    title="Push rejected"
                    action={<Button size="sm">Retry</Button>}
                  >
                    infra-scripts is still provisioning.
                  </Callout>
                  <Progress value={62} label="Upload progress" />
                  <Progress label="Setting up storage" />
                </div>
              </Section>

              <Section id="k-states" title="Loading, empty, error">
                <div class={styles.grid}>
                  <Card>
                    <CardBody class={styles.col}>
                      <SkeletonText />
                      <Skeleton height={60} />
                    </CardBody>
                  </Card>
                  <Card>
                    <EmptyState
                      art="no-ssh-keys"
                      compact
                      level={3}
                      actions={
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setSshOpen(true)}
                        >
                          Add SSH key
                        </Button>
                      }
                    />
                  </Card>
                  <Card>
                    <EmptyState
                      art="load-error"
                      compact
                      level={3}
                      title="Couldn't load history."
                      requestId="mock-0042"
                      actions={
                        <Button size="sm">
                          <Icon name="refresh" size={13} />
                          Try again
                        </Button>
                      }
                    />
                  </Card>
                </div>
              </Section>

              <Section id="k-ill" title="Illustrations">
                <Row>
                  <For
                    each={
                      [
                        "no-repos",
                        "no-results",
                        "provisioning",
                        "not-found",
                      ] as const
                    }
                  >
                    {(id) => (
                      <figure class={styles.fig}>
                        <Illustration id={id} size={150} />
                        <figcaption>{id}</figcaption>
                      </figure>
                    )}
                  </For>
                </Row>
                <ButtonLink href="/dev/illustrations" class={styles.mt}>
                  All 31 illustrations
                </ButtonLink>
              </Section>

              <Section id="k-overlays" title="Dialogs and toasts">
                <Label>Dialogs</Label>
                <Row>
                  <Button onClick={() => setSshOpen(true)}>Form dialog</Button>
                  <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                    Type-to-confirm
                  </Button>
                </Row>
                <Label>Toasts</Label>
                <Row>
                  <Button
                    onClick={() => showToast({ message: "Changes saved" })}
                  >
                    Success
                  </Button>
                  <Button
                    onClick={() =>
                      showToast({
                        message: "Viewing feature/data-structures",
                        tone: "info",
                      })
                    }
                  >
                    Info
                  </Button>
                  <Button
                    onClick={() =>
                      showToast({
                        message: "Push rejected: repository is archived",
                        tone: "err",
                      })
                    }
                  >
                    Error
                  </Button>
                  <Button
                    onClick={() =>
                      showToast({
                        message: "Archived legacy-billing",
                        action: {
                          label: "Undo",
                          onClick: () =>
                            showToast({ message: "Undone", tone: "info" }),
                        },
                      })
                    }
                  >
                    With undo
                  </Button>
                </Row>
              </Section>

              <Section id="k-table" title="Data table">
                <Card>
                  <Table caption="Members">
                    <thead>
                      <tr>
                        <Th
                          sort={sort()}
                          onSort={() =>
                            setSort((s) =>
                              s === "ascending" ? "descending" : "ascending",
                            )
                          }
                        >
                          Name
                        </Th>
                        <Th>Role</Th>
                        <Th numeric>Last active</Th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={members()}>
                        {(m) => (
                          <tr>
                            <Td>{m.name}</Td>
                            <Td>
                              <Pill
                                tone={
                                  m.role === "owner"
                                    ? "purple"
                                    : m.role === "admin"
                                      ? "blue"
                                      : "green"
                                }
                              >
                                {m.role}
                              </Pill>
                            </Td>
                            <Td numeric>{m.last}</Td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </Table>
                  <Pager
                    from={1}
                    to={3}
                    total={5}
                    hasPrevious={false}
                    hasNext
                    label="Members"
                  />
                </Card>
              </Section>

              <Section id="k-people" title="Avatars and tooltips">
                <Row>
                  <Avatar name="Brxj19" tone={1} />
                  <Avatar name="Tatwa Prasad" tone={2} />
                  <Avatar name="Kushwah Dheeraj" tone={3} size={22} />
                  <AvatarStack
                    people={KIT_MEMBERS.map((m, i) => ({
                      name: m.name,
                      tone: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
                    }))}
                  />
                  <Tooltip
                    content="Tooltips work on hover and focus"
                    as="button"
                  >
                    <span class={styles.tipDemo}>Hover me</span>
                  </Tooltip>
                </Row>
              </Section>

              <Section id="k-icons" title="File and folder icons">
                <Row>
                  <For each={KIT_ICON_NAMES}>
                    {(n) => (
                      <span class={styles.iconSample}>
                        <FileIcon name={n} />
                        {n}
                      </span>
                    )}
                  </For>
                </Row>
                <IconBrowser />
              </Section>

              <Section id="k-charts" title="Sparklines, heatmap and graph">
                <Row>
                  <For each={KIT_SPARKS}>
                    {(s) => (
                      <span class={styles.spark}>
                        <Sparkline
                          values={s.values}
                          color={s.color}
                          width={110}
                          height={32}
                          label={`${s.slug}: 12 weeks of activity`}
                        />
                        <small>{s.slug}</small>
                      </span>
                    )}
                  </For>
                </Row>
                <Label>Heatmap</Label>
                <Heatmap days={heatDays} today={new Date(2026, 9, 5)} />
                <Label>Graph legend</Label>
                <Row>
                  <span class={styles.legend}>
                    <svg width="20" height="20" aria-hidden="true">
                      <circle
                        cx="10"
                        cy="10"
                        r="4.5"
                        fill="var(--accent)"
                        stroke="var(--accent)"
                        stroke-width="2"
                      />
                    </svg>
                    Changeset
                  </span>
                  <span class={styles.legend}>
                    <svg width="20" height="20" aria-hidden="true">
                      <circle
                        cx="10"
                        cy="10"
                        r="4.5"
                        fill="var(--bg)"
                        stroke="var(--accent)"
                        stroke-width="2"
                      />
                    </svg>
                    Merge
                  </span>
                  <span class={styles.legend}>
                    <svg width="20" height="20" aria-hidden="true">
                      <circle
                        cx="10"
                        cy="10"
                        r="6"
                        fill="var(--purple)"
                        stroke="var(--purple)"
                        stroke-width="2"
                      />
                    </svg>
                    Selected
                  </span>
                </Row>
              </Section>
            </div>
          </Pane>
        </Panes>
      </WsBody>

      <Dialog
        open={sshOpen()}
        onOpenChange={(o) => {
          setSshOpen(o);
          setKeyError(undefined);
        }}
        title="Add an SSH key"
        description="Lets this machine clone and push over SSH."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSshOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const v =
                  (
                    document.getElementById(
                      "kit-key",
                    ) as HTMLTextAreaElement | null
                  )?.value.trim() ?? "";
                if (!v.startsWith("ssh-"))
                  return setKeyError(
                    "That doesn't look like a public key. It should start with ssh-ed25519 or ssh-rsa.",
                  );
                setSshOpen(false);
                showToast({ message: "SSH key added" });
              }}
            >
              Add key
            </Button>
          </>
        }
      >
        <Field label="Name">
          <Input placeholder="Work laptop" />
        </Field>
        <Field
          id="kit-key"
          label="Public key"
          hint={
            <>
              Paste the contents of <code>~/.ssh/id_ed25519.pub</code>. Never
              paste the private key.
            </>
          }
          error={keyError()}
        >
          <Textarea
            mono
            rows={4}
            placeholder="ssh-ed25519 AAAAC3Nza… you@machine"
          />
        </Field>
      </Dialog>
      <ConfirmDialog
        open={deleteOpen()}
        onOpenChange={setDeleteOpen}
        title="Delete sigma-reckitt?"
        body="All changesets, branches and settings are removed for good. Clones on people's machines are kept."
        confirmLabel="Delete repository"
        tone="danger"
        typedConfirmation="sigma/sigma-reckitt"
        auditNote="Recorded as a high-severity audit event."
        onConfirm={() => {
          showToast({ message: "Deleted sigma-reckitt (demo)" });
        }}
      />
    </Workspace>
  );
}
