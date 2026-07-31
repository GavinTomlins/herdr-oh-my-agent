#!/bin/bash
# Orchestrator pane content for the demo recording.
say() { printf "%b\n" "$1"; sleep "${2:-1}"; }
clear
say "\033[2m$\033[0m opencode --port 4096" 1
say "" 0.2
say "\033[1;36m◍ sisyphus\033[0m · orchestrating" 1.5
say "" 0.2
say "\033[2m>\033[0m ulw Review this repository before release" 2
say "  planning… \033[1m2 delegations\033[0m queued" 2
say "  → task(\033[1;35moracle\033[0m):  review plugin event handling" 2.5
say "  → task(\033[1;33mexplore\033[0m): map repository layout" 3
say "  \033[2m⧗ waiting on subagents…\033[0m" 11
say "  \033[32m✓\033[0m \033[1;35moracle\033[0m done — verdict received" 2.5
say "  \033[32m✓\033[0m \033[1;33mexplore\033[0m done — layout mapped" 2
say "  \033[1m✎ synthesis:\033[0m event handling sound, ready to ship" 30
