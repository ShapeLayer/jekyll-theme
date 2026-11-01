#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 scripts/prepare-theme.py chirpy
 (cd chirpy_deploy && sh postdeploy.sh)
