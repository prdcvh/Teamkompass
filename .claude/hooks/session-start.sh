#!/bin/bash
set -euo pipefail

# Only relevant for Claude Code on the web, where each session starts
# from a fresh, ephemeral container and global npm/CLI state is lost.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# SCRUM-86: Das Werkzeug kommt aus der festgeschriebenen Version in
# .claude/hooks/tools/package-lock.json (inkl. aller Unterpakete mit Integritätsprüfung).
# `npm ci` bricht bei abweichender Integrität ab; Installationsskripte werden nie ausgeführt.
# Keine globale Installation einer beweglichen Version mehr.
tools_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tools"
npm ci --prefix "$tools_dir" --ignore-scripts --no-audit --no-fund
"$tools_dir/node_modules/.bin/uipro" init --ai claude --global
