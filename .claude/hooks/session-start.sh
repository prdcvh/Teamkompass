#!/bin/bash
set -euo pipefail

# Only relevant for Claude Code on the web, where each session starts
# from a fresh, ephemeral container and global npm/CLI state is lost.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# SCRUM-232: Angular CLI 22 braucht Node >= 22.22.3, die Cloud-Sitzung bringt 22.22.0 mit.
# Festgeschriebene Version, Prüfsumme fest im Skript. Schlägt der Schritt fehl (kein Netz,
# falsche Prüfsumme, anderes System), wird nichts installiert und der Sitzungsstart läuft
# mit dem vorhandenen Node weiter; der Fehler steht dann im Hook-Protokoll.
node_version="22.23.4"
node_sha256="1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce"
install_node() {
  [ "$(uname -s)-$(uname -m)" = "Linux-x86_64" ] || { echo "Node-Bereitstellung übersprungen: nur linux-x64" >&2; return 1; }
  local base="$HOME/.cache/teamkompass-node"
  local node_dir="$base/node-v${node_version}-linux-x64"
  if [ ! -x "$node_dir/bin/node" ]; then
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL --retry 3 -o "$tmp/node.tar.xz" "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-x64.tar.xz" || return 1
    echo "${node_sha256}  $tmp/node.tar.xz" | sha256sum -c - || return 1
    mkdir -p "$tmp/x" "$base"
    tar -xJf "$tmp/node.tar.xz" -C "$tmp/x" || return 1
    mv "$tmp/x/node-v${node_version}-linux-x64" "$node_dir" || return 1
  fi
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$node_dir/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
}
install_node || echo "WARNUNG: Node $node_version nicht bereitgestellt, Sitzung läuft mit $(node -v 2>/dev/null || echo 'keinem Node')" >&2

# SCRUM-86: Das Werkzeug kommt aus der festgeschriebenen Version in
# .claude/hooks/tools/package-lock.json (inkl. aller Unterpakete mit Integritätsprüfung).
# `npm ci` bricht bei abweichender Integrität ab; Installationsskripte werden nie ausgeführt.
# Keine globale Installation einer beweglichen Version mehr.
tools_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tools"
npm ci --prefix "$tools_dir" --ignore-scripts --no-audit --no-fund
"$tools_dir/node_modules/.bin/uipro" init --ai claude --global
