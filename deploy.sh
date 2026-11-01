#!/bin/sh
set -eu
cd "$(dirname "$0")"
[ -z "$(git status --porcelain)" ] || { echo 'Commit source changes before deploying.' >&2; exit 1; }
source_commit=$(git rev-parse HEAD)
npm ci --no-audit --no-fund
npm run build
for theme in basically-basic chirpy contrast garden gitbook mmistakes; do
  sh "deploy_${theme}.sh"
done
# Build everything successfully before replacing the remote deployment branch.
staging=$(mktemp -d)
trap 'git worktree remove --force "$staging" >/dev/null 2>&1 || true; rm -rf "$staging"' EXIT HUP INT TERM
git fetch origin deploy
git worktree add --detach "$staging" origin/deploy
# Start from the committed source; old generated files must not survive updates.
git -C "$staging" rm -r -q --ignore-unmatch .
git archive "$source_commit" | tar -x -C "$staging"
for theme in basically-basic chirpy contrast garden gitbook mmistakes; do
  python3 - "$theme" "$staging" <<'PYTHON'
import pathlib, shutil, sys
name = sys.argv[1] + "_deploy"
shutil.copytree(name, pathlib.Path(sys.argv[2]) / name, ignore=shutil.ignore_patterns("node_modules", ".DS_Store", ".bundle", "_site", ".jekyll-cache"))
PYTHON
  git -C "$staging" add -f "${theme}_deploy"
done
git -C "$staging" add .
git -C "$staging" commit -m "Deploy themes from $source_commit"
git -C "$staging" push origin HEAD:deploy
