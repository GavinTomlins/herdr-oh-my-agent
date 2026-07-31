#!/bin/bash
# Tab-placement demo: subagent tabs appear early and the driver dwells on
# each one so the tab bar is unmistakably the point of the recording.
set -u
export HERDR_SESSION=gifdemo
DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"

log() { printf '%s %s\n' "$(date +%T)" "$1"; }

first_pane() {
  herdr pane list 2>/dev/null | jq -r '[.. | objects | select(has("pane_id"))][0].pane_id // empty'
}

for _ in $(seq 1 120); do
  P1=$(first_pane)
  [ -n "${P1:-}" ] && break
  sleep 0.5
done
if [ -z "${P1:-}" ]; then log "gifdemo session never came up"; exit 1; fi
T1=$(herdr pane get "$P1" | jq -r '.result.pane.tab_id')
W1=$(herdr pane get "$P1" | jq -r '.result.pane.workspace_id')
log "root pane: $P1 tab: $T1"

herdr pane rename "$P1" sisyphus >/dev/null
herdr tab rename "$T1" sisyphus >/dev/null
herdr pane report-agent "$P1" --source demo --agent sisyphus --state working --message "orchestrating" >/dev/null
herdr pane run "$P1" "bash $DEMO_DIR/orchestrator.sh" >/dev/null

# --- recording becomes visible about here ---
sleep 6

# Oracle tab appears, no focus stolen (exactly what the plugin does)
OUT=$(herdr tab create --workspace "$W1" --label oracle --no-focus)
T2=$(printf '%s' "$OUT" | jq -r '.result.tab.tab_id // empty')
P2=$(printf '%s' "$OUT" | jq -r '.result.root_pane.pane_id // empty')
log "oracle tab: $T2"
if [ -n "$P2" ]; then
  herdr pane rename "$P2" oracle >/dev/null
  herdr pane report-agent "$P2" --source demo --agent oracle --state working --message "review index.ts" >/dev/null
  herdr pane run "$P2" "bash $DEMO_DIR/oracle.sh" >/dev/null
fi
sleep 4

# Explore tab appears
OUT=$(herdr tab create --workspace "$W1" --label explore --no-focus)
T3=$(printf '%s' "$OUT" | jq -r '.result.tab.tab_id // empty')
P3=$(printf '%s' "$OUT" | jq -r '.result.root_pane.pane_id // empty')
log "explore tab: $T3"
if [ -n "$P3" ]; then
  herdr pane rename "$P3" explore >/dev/null
  herdr pane report-agent "$P3" --source demo --agent explore --state working --message "map repo layout" >/dev/null
  herdr pane run "$P3" "bash $DEMO_DIR/explore.sh" >/dev/null
fi
sleep 4

# Dwell on each subagent tab so its content is readable
[ -n "${T2:-}" ] && herdr tab focus "$T2" >/dev/null
sleep 6
[ -n "${T3:-}" ] && herdr tab focus "$T3" >/dev/null
sleep 6
herdr tab focus "$T1" >/dev/null
sleep 2

[ -n "${P2:-}" ] && herdr pane report-agent "$P2" --source demo --agent oracle --state idle --message "verdict delivered" >/dev/null
sleep 1
[ -n "${P3:-}" ] && herdr pane report-agent "$P3" --source demo --agent explore --state idle --message "layout mapped" >/dev/null
sleep 1
herdr pane report-agent "$P1" --source demo --agent sisyphus --state idle --message "synthesis complete" >/dev/null
sleep 4
log "done"
