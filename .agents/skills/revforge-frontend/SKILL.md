---
name: revforge-frontend
description: Build or review RevForge React and TypeScript interfaces for repository browsing, changesets, diffs, clone flows, organizations, teams, reviews, settings, and audit activity. Use when UI, accessibility, navigation, design tokens, or frontend state is involved. Follow DESIGN.md.
---

# RevForge Frontend Product Skill

## Objective

Create an information-dense, calm, accessible developer interface that makes repository state and change history obvious without turning RevForge into a generic dashboard.

## Required references

Read `DESIGN.md` before designing or changing a screen. Reuse primitives from `packages/ui` when they exist.

## Workflow

### 1. Start from user outcome

State:

- primary user goal;
- required context (organization, repository, revision, path, role);
- primary action;
- secondary actions;
- failure/empty/loading/permitted-denied states;
- URL state that must be shareable.

### 2. Preserve source-control context

- Keep organization/repository identity visible.
- Preserve revision, path, compare direction, filters, pagination, and active tab in URL parameters or route segments.
- Use true Mercurial vocabulary: changeset, revision, branch, bookmark, tag, clone, pull, push.
- Show full hashes, paths, and timestamps through copy/tooltip patterns without making the page visually noisy.

### 3. Structure component ownership

- Shared primitives: `packages/ui`.
- Domain components: feature folders, such as `features/repositories`, `features/changesets`, or `features/reviews`.
- Remote data: TanStack Query with keys tied to stable IDs and URL state.
- Local ephemeral state: component state or scoped store only when necessary.
- Avoid passing opaque API blobs through many components; map them to view models near the feature boundary.

### 4. Accessibility and interaction

- Use semantic HTML first.
- Ensure visible keyboard focus and predictable focus movement in menus/dialogs.
- Icon-only controls require accessible names.
- Do not use color as the only difference between additions/deletions or statuses.
- Preserve text selection and copy behavior in code/diff views.
- Test at 200% zoom and narrow viewport.

### 5. Readable diff and history design

- Default to unified diffs.
- Keep line numbers aligned and copyable.
- Do not syntax-highlight untrusted content in a way that executes markup or scripts.
- Make loading/large-file/binary-file states explicit.
- Use stable file anchors for comments and permanent links.

### 6. Use disciplined visual design

- Use design tokens; do not hardcode arbitrary colors or spacing in feature components.
- Prefer borders and clear hierarchy over cards everywhere.
- Do not add gradients, glassmorphism, decorative charts, animated backgrounds, or unnecessary motion.
- Keep primary actions obvious and secondary actions quiet.

## Required frontend validation

- Type check and lint.
- Component/unit tests for conditional rendering and interactions.
- Route test or E2E test for the primary user flow.
- Keyboard smoke test: tab through controls, trigger actions, close overlays, and confirm focus restoration.
- Manual visual review in light and dark themes.
- Verify loading, empty, error, denied, and narrow-width states.

## Deliverables

- screen/user-flow summary;
- route and URL-state behavior;
- component/API changes;
- accessibility treatment;
- tests run and remaining UI limitations.
