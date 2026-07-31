#!/bin/bash
say() { printf "%b\n" "$1"; sleep "${2:-1}"; }
clear
say "\033[2m$\033[0m opencode attach localhost:4096 --session ses_0b7f2e…" 0.8
say "" 0.2
say "\033[1;33m◆ explore\033[0m · child session \033[2mses_0b7f2e…\033[0m" 1.2
say "" 0.2
say "\033[2m>\033[0m map the repository layout" 1.5
say "  herdr-plugin.toml         \033[2mmanifest + actions\033[0m" 1.4
say "  packages/…subagent-panes  \033[2mthe OpenCode plugin\033[0m" 1.4
say "  scripts/register…mjs      \033[2msafe opencode.json edit\033[0m" 1.4
say "  AGENTS.md · PLAN.md       \033[2magent docs · design\033[0m" 2
say "" 0.2
say "  \033[1mdone:\033[0m 4 top-level areas, single-file plugin core" 30
