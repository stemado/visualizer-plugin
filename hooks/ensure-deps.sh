#!/usr/bin/env bash
# Ensure node_modules exists for the visualizer MCP server.
# Runs on SessionStart — skips if already installed.

PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  echo "Visualizer: Installing dependencies..."
  cd "$PLUGIN_DIR" && npm install --omit=dev --silent 2>&1
  echo "Visualizer: Dependencies installed."
else
  echo "Visualizer: Dependencies OK."
fi
