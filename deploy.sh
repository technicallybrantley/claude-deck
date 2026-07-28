#!/usr/bin/env bash
# macOS counterpart to deploy.ps1: stop Stream Deck, replace the installed plugin
# folder, start it again. Same two overlay rules as the Windows script — see the
# comments there for why the usage cache and local-assets exist.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/com.technicallybrantley.claude-deck.sdPlugin"
DST="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/com.technicallybrantley.claude-deck.sdPlugin"

# The app is addressed by bundle id on both sides on purpose: its Unix executable
# is "Elgato Stream Deck" while its AppleScript/display name is "Stream Deck",
# and picking the wrong one silently matches nothing.
BUNDLE="com.elgato.StreamDeck"
PROC="Elgato Stream Deck"

osascript -e "quit app id \"$BUNDLE\"" >/dev/null 2>&1 || true
for _ in $(seq 1 20); do
  pgrep -x "$PROC" >/dev/null 2>&1 || break
  sleep 0.25
done

# usage-cache.json lives inside the installed folder, so a plain wipe-and-copy
# throws away the last good usage reading — the very thing that exists so a
# restart doesn't show empty gauges.
CACHE="$DST/usage-cache.json"
SAVED=""
[ -f "$CACHE" ] && SAVED="$(cat "$CACHE")"

rm -rf "$DST"
mkdir -p "$(dirname "$DST")"
cp -R "$SRC" "$DST"

if [ -n "$SAVED" ]; then
  printf '%s' "$SAVED" > "$DST/usage-cache.json"
  echo "preserved usage cache across deploy"
fi

LOGO="$(dirname "$SRC")/local-assets/claude-logo.png"
if [ -f "$LOGO" ]; then
  cp "$LOGO" "$DST/imgs/launch.png"; rm -f "$DST/imgs/launch.svg"
  cp "$LOGO" "$DST/imgs/plugin.png"; rm -f "$DST/imgs/plugin.svg"
  echo "applied local claude-logo.png to launch + category icons"
fi

SPRITE="$(dirname "$SRC")/local-assets/sprite.json"
if [ -f "$SPRITE" ]; then
  cp "$SPRITE" "$DST/sprite.json"
  echo "applied local sprite.json to the Scuttle tile"
fi

if [ "${1:-}" != "--no-restart" ]; then
  open -b "$BUNDLE"
fi
echo "deployed to $DST"
