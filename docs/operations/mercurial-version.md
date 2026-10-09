# Supported Mercurial version

RevForge supports exactly one Mercurial release series at a time.

| Item | Value |
|---|---|
| Supported series | **7.2.x** |
| Constraint | `mercurial>=7.2,<7.3` in `backend/pyproject.toml` |
| Locked release | the `mercurial` entry in `backend/uv.lock` (7.2.3 at the time of writing) |
| CLI used by the server | the `hg` entry point installed from the same lock (`/usr/local/bin/hg` in containers) |

## Why one source

RevForge reads repositories both in-process (`import mercurial`: revision lookup, manifests,
branch heads, prefix resolution) and through the `hg` executable (`init`, `verify`, `cat`,
`annotate`, `diff`, `log`). If the CLI and the library come from different releases, on-disk
format requirements, template output and error text can drift apart without a test failing.
The audit item for this is **I38**.

Rules:

- Container images install Mercurial **only** from `backend/uv.lock` (`uv sync --frozen`).
  The distro `mercurial` package must not be installed in `infra/backend/Dockerfile.dev` or
  `infra/ssh/Dockerfile.dev`. Both images fail to build if `hg version` differs from the
  library version.
- `REVFORGE_HG_EXECUTABLE` should be an absolute path. A bare name (`hg`) resolves first to
  the `hg` next to the running Python interpreter (the uv environment), then to `PATH`.
  Relative paths are rejected.
- The API (FastAPI lifespan) and the worker refuse to start when the CLI version differs from
  the library version or falls outside the supported series
  (`app/mercurial/version_check.py`). The SSH gateway uses only the library and does not run
  the check, so it never writes to stdout before the protocol server starts.
- New repositories are created in a staging directory, checked with `hg verify -q`, and only
  then renamed into place (`app/mercurial/provisioning_service.py`).

## Relied-on behaviour

These are the Mercurial behaviours RevForge depends on. Re-check them when changing the series.

- `hg.repository(ui, path).filtered(b"served")` hides secret and obsolete changesets, as
  hgweb does. Browsing, refs and revision lookup use this view.
- `scmutil.resolvehexnodeidprefix` checks prefixes against the unfiltered changelog. RevForge
  re-resolves ambiguous prefixes within the served view, so hidden changesets are not
  disclosed through "ambiguous" answers.
- `repo.branchtip(name, ignoremissing=True)` returns the tip-most open head of a branch.
- `hg annotate -Tjson -u -n -f -d -l -c` emits `user`, `rev`, `node`, `path`, `date`, `lineno`
  and `line` per line.
- `hg version -T '{ver}'` prints the bare version string.
- File arguments are patterns even after `--`, so RevForge always passes `path:<relpath>`.

## Upgrading

1. Change the constraint in `backend/pyproject.toml` and `SUPPORTED_MERCURIAL_SERIES` in
   `backend/app/mercurial/version_check.py`, then run `uv lock` in `backend/`.
2. Run `make backend-sync` and the full backend suite. It runs real `hg` against disposable
   repositories, including the read path and the HTTP/SSH protocol tests.
3. Rebuild both images (`make up` rebuilds them). The build-time version assertion must pass.
4. Run a manual `hg clone` / `hg push` against a provisioned repository over HTTPS and SSH.
5. Update this page.

Downgrading follows the same steps. Repositories created by a newer release can carry
format requirements an older release cannot open, so check `.hg/requires` on existing
repositories before downgrading.
