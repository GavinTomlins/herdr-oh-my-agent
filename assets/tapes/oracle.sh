#!/bin/bash
say() { printf "%b\n" "$1"; sleep "${2:-1}"; }
clear
say "\033[2m$\033[0m opencode attach localhost:4096 --session ses_0a91c4…" 0.8
say "" 0.2
say "\033[1;35m◆ oracle\033[0m · child session \033[2mses_0a91c4…\033[0m" 1.2
say "" 0.2
say "\033[2m>\033[0m review packages/herdr-subagent-panes/index.ts" 1.5
say "  reading index.ts \033[2m(212 lines)\033[0m" 2
say "  \033[32m✓\033[0m event hook filters on parentID" 1.8
say "  \033[32m✓\033[0m timeout guard wraps every herdr call" 1.8
say "  \033[32m✓\033[0m no-op outside managed panes" 2
say "" 0.2
say "  \033[1mverdict:\033[0m event handling is sound;" 0.4
say "  delegation is never blocked by the mirror path" 30
