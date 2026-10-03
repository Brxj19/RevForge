---
description: Deliver the current branch via the AGENTS.md git workflow (checks, commit, push, PR) — stops before merging
argument-hint: "[conventional commit message]"
---

Deliver the current work following the "Phase delivery and Git completion rule" in AGENTS.md.

1. `git status` and `git diff --stat`. If on `main`, create a feature branch first (`agent/<short-topic>`). Flag any unrelated, generated, secret, or debug files and ask before including them.
2. Run `make format`, `make lint`, `make typecheck`, `make test`. Stop and report on any failure.
3. `git fetch origin --prune` and review `git diff origin/main...HEAD` (delegate to `revforge-qa`; also `revforge-security` if auth/protocol/webhooks/migrations changed).
4. Stage only intended files (never `git add -A` blindly), show me `git diff --cached --stat`.
5. Commit with a Conventional Commit message. Use this if provided: $ARGUMENTS
6. `git push -u origin <branch>` and `gh pr create --base main --fill` (or with `--body-file .github/pull_request_template.md`).
7. `gh pr checks --watch`.
8. STOP. Show the PR URL and check status, and ask me before running `gh pr merge --squash --delete-branch`.
9. After I approve and the merge succeeds: `git switch main && git pull --ff-only origin main && git branch -d <branch> && git status`, then print the AGENTS.md "Git delivery" report.

Never force-push, never push to main, never bypass checks or reviews.
