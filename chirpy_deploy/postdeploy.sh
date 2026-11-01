#!/bin/sh
set -eu
cat ./_personalizations/metadata-hook.html >> ./_includes/metadata-hook.html
HUSKY=0 npm install --no-audit --no-fund
npm run build
# Ship compiled frontend assets in the deployment branch.
sed -e '/assets\/js\/dist/d' -e '/_sass\/vendors/d' .gitignore > .gitignore.tmp
mv .gitignore.tmp .gitignore
