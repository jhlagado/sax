#!/usr/bin/env bash
set -euo pipefail

interval_seconds="${1:-200}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found on PATH" >&2
  exit 1
fi

if ! command -v yarn >/dev/null 2>&1; then
  echo "error: yarn not found on PATH" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

pick_pr_number() {
  # If the current branch has an associated PR, prefer it.
  if gh pr view --json number -q .number >/dev/null 2>&1; then
    gh pr view --json number -q .number
    return 0
  fi

  # Otherwise, pick the most recently updated open PR.
  gh pr list --state open --limit 1 --sort updated --json number -q '.[0].number'
}

while true; do
  sleep "$interval_seconds"

  pr_number="$(pick_pr_number || true)"
  if [[ -z "${pr_number:-}" || "$pr_number" == "null" ]]; then
    echo "[$(date -Is)] no open PRs"
    continue
  fi

  title="$(gh pr view "$pr_number" --json title -q .title)"
  author_login="$(gh pr view "$pr_number" --json author -q .author.login)"
  echo "[$(date -Is)] reviewing PR #$pr_number: $title (author: $author_login)"

  original_branch="$(git branch --show-current || true)"
  gh pr checkout "$pr_number" >/dev/null

  body_prefix="PR #$pr_number automated pass: "
  format_ok=true
  typecheck_ok=true
  test_ok=true
  yarn -s format:check || format_ok=false
  yarn -s typecheck || typecheck_ok=false
  yarn -s test || test_ok=false

  if [[ -n "${original_branch:-}" ]]; then
    git checkout "$original_branch" >/dev/null 2>&1 || true
  fi

  if [[ "$format_ok" == true && "$typecheck_ok" == true && "$test_ok" == true ]]; then
    gh pr comment "$pr_number" --body "${body_prefix}local checks passed (format/typecheck/test)."
  else
    gh pr comment "$pr_number" --body "${body_prefix}local checks failed (format_ok=$format_ok typecheck_ok=$typecheck_ok test_ok=$test_ok)."
  fi
done
