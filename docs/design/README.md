# RevForge design

| File | What it is |
|---|---|
| `../../DESIGN.md` | The design contract (v3): tokens, layout, components, patterns, screen rules, accessibility, copy. |
| `revforge-prototype.html` | Single-file clickable prototype of every screen. Open it in any browser; no build step. |
| `archive/` | Superseded design documents. Kept for history; don't follow them. |

## Using the prototype
- Navigate with the sidebar, or paste a hash route (examples: `#/r/sigma-reckitt/code/main.cpp`, `#/r/sigma-reckitt/history`, `#/r/sigma-reckitt/pulls/7`, `#/explore`).
- **Screens & API map** (`#/map`) lists every screen, its route and the backend endpoints it needs.
- **UI kit** (`#/ui`) and **Illustrations** (`#/illustrations`) show every component and illustration with its states.
- **View as anonymous** in the sidebar switches to the signed-out experience; *Sign in* switches back.
- Data is fictional (organization `sigma`, repository `sigma-reckitt`).
- The prototype loads IBM Plex from Google Fonts for convenience; the real app self-hosts fonts.

The prototype is plain HTML/JS on purpose: its source is the reference for exact CSS values, icon and illustration data, and interaction behaviour. Port data and styles from it; rebuild components in SolidJS per `.agents/skills/revforge-frontend/`.
