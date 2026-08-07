#!/bin/bash
set -euo pipefail

# Only relevant for Claude Code on the web, where each session starts
# from a fresh, ephemeral container and global npm/CLI state is lost.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

npm install -g ui-ux-pro-max-cli
uipro init --ai claude --global
