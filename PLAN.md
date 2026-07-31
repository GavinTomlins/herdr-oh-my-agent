# herdr-oh-my: subagent visibility plugin for Herdr + OpenCode + oh-my-openagent

Plan of record, 2026-07-31. Sources: `~/personal/repos/herdr` (v0.7.5 source),
`~/personal/repos/oh-my-openagent` (v4.19.3 source), herdr.dev docs, omo.dev docs,
`~/repos/system/workspace/ai/HANDOFF-agent-tabs.md`,
`~/repos/personal/opencode/herdr-subagent-status/HANDOFF.md`.

## The discovery that changes the old plan

The previous handoff assumed omo's `task` tool runs subagents "fully in-process — no
separate terminal/PTY", so the only options were (a) status overlay on the delegating
pane or (b) replacing delegation with hand-rolled Herdr spawning (Dotzlaw), which was
rightly rejected.

**Both assumptions are now obsolete.** In current omo (v4.19.x) every delegation
creates a *real child OpenCode session* via the SDK with `parentID`
(`packages/omo-opencode/src/tools/delegate-task/sync-session-creator.ts:18-36`), and
omo already ships a feature that mirrors each child session into its own tmux pane:
`features/tmux-subagent/` (off by default, `tmux.enabled: false`). The pane simply runs:

```
opencode attach <serverUrl> --session <childSessionId> --dir <projectDir>
```

Verified locally: opencode 1.18.9 supports `attach --session --dir`.

So the right design is neither "overlay only" nor "replace delegation": **observe the
real child sessions and attach to them in Herdr panes/tabs**. No double execution, no
loss of omo's hardened delegation (GOAL/STOP-WHEN/EVIDENCE, model routing), full
session state and scrollback — because the pane is showing the *actual* subagent
session, which persists on disk and can be re-attached at any time.

## Architecture: two cooperating plugins

### Plugin A — `herdr-subagent-panes` (OpenCode plugin, TypeScript, the core)

An `@opencode-ai/plugin` module, structurally a port of omo's `tmux-subagent` manager
with Herdr's CLI/socket API as the backend instead of tmux.

Event flow (all via the plugin `event` hook — same events tmux-subagent uses,
`plugin/event-session-lifecycle.ts:24-30`):

1. `session.created` with `properties.info.parentID` set → a subagent was delegated.
   - Wait until the child appears in the server's session status map before spawning
     (tmux-subagent does this to avoid `opencode attach` exiting instantly —
     issue #3505, `session-created-handler.ts:108-119`).
   - Create the viewing surface per config:
     - `placement: "tab"` → `herdr tab create --workspace $HERDR_WORKSPACE_ID
       --label <agent> --no-focus --env OMO_CHILD_SESSION=<id>` (screenshot areas 1–4)
     - `placement: "split"` → `herdr pane split $HERDR_PANE_ID --direction right
       --ratio 0.4 --no-focus --env ...`
   - Capture the new pane id from the JSON response (`.result.root_pane` / `.result.pane`).
   - `herdr pane run <paneId> "opencode attach <url> --session <id> --dir <dir>"`.
2. Identity/metadata onto the new pane:
   - Herdr auto-detects `opencode` kind via screen manifest; additionally:
   - `herdr pane report-metadata <paneId> --source oh-my-openagent:subagent
     --display-agent <subagent_type> --token parent=$HERDR_PANE_ID --token depth=1
     --token task="<description>"`
   - `herdr pane report-agent-session <paneId> --source oh-my-openagent:subagent
     --agent <subagent_type> --agent-session-id <childSessionId>` → Herdr's native
     session-restore (`[session] resume_agents_on_restore`) can revive the pane after
     a restart.
3. `session.idle` / `session.deleted` for the child → lifecycle per config:
   - `keep` (default): leave the pane open; Herdr shows `done` (unseen-idle) in the
     sidebar — you review at leisure, scrollback intact inside the attach TUI.
   - `close_on_done` / `ttl_ms`: optional auto-cleanup to avoid pane accumulation.
4. Not inside Herdr (`HERDR_PANE_ID` unset) → whole plugin no-ops
   (same guard pattern as the existing `herdr-subagent-status` plugin).

Config (plugin config file or env, zod-validated), deliberately mirroring
tmux-subagent's shape:

```jsonc
{
  "enabled": true,
  "placement": "tab" | "split",        // areas 1–4 (tabs) vs split next to parent
  "split_direction": "right", "split_ratio": 0.4,
  "lifecycle": "keep" | "close_on_done" | { "ttl_ms": 600000 },
  "mode": "attach" | "stream",         // see Phase 3
  "agents": { "include": [], "exclude": [] },  // e.g. skip "explore" noise
  "max_panes": 8                        // guard against fan-out storms
}
```

### Plugin B — `herdr-omo-sidebar` (Herdr manifest plugin, optional polish)

A `herdr-plugin.toml` plugin (`herdr plugin link` during dev) for the sidebar tree —
screenshot areas 5–8:

- `[[startup]]` hook applies an `agent.view.set` projection: sort by
  `{"token":"parent"}` / `{"token":"depth"}`, giving a visually nested
  orchestrator → subagent tree in the Agents sidebar. (Projections aren't persisted;
  the documented pattern is save query in `HERDR_PLUGIN_STATE_DIR`, reapply on startup.)
- Sidebar row templates: `[ui.sidebar.agents] rows_by_agent.opencode` rendering
  `$task` / `$parent` tokens under the agent name.
- `[[actions]]`: "focus parent pane", "close all done subagent panes", bindable to keys.
- `[[events]]` on `pane.closed` for tidy-up of orphaned metadata.

Plugin A works standalone; B only improves presentation.

## Why this satisfies each stated goal

| Goal | How |
|---|---|
| Core agents visible | Already solved by Part 1 workspace script (one tab per primary agent); unchanged |
| Subagents observable | Every delegation auto-appears as its own pane/tab attached to the live child session |
| Panes vs tabs configurable | `placement` config; tabs land in the tab bar (areas 1–4), sidebar entries appear automatically (areas 5–8) |
| Session state maintained | The pane *is* the real OpenCode session; persisted in `~/.local/share/opencode/storage/{session,message,part}`; re-attachable; herdr `report-agent-session` enables native restore |
| Full scrollback | Scroll inside the attach TUI (full transcript replay); `stream` mode (Phase 3) adds herdr-native scrollback |
| Replaces Ctrl+X tree-walking | Each subagent is one click away as a pane/tab instead of navigating the session tree |

## Known constraints (verified in source)

- **Fixed port required**: `opencode` must run with `--port N` (and `OPENCODE_PORT=N`)
  so the attach URL is resolvable — omo's `resolve-server-url.ts:20-25` documents the
  port-0 caveat. The Part 1 setup script needs a small amendment to launch each
  primary agent with a distinct fixed port.
- **One effective agent per pane** in Herdr's model — fine here, since each subagent
  gets its own pane; the tree is expressed via metadata tokens, not nesting.
- **Alternate-screen TUIs don't enter herdr host scrollback** — `herdr pane read` on an
  attach pane sees only the viewport. Scrollback lives inside the attach TUI (which
  replays session history), so this only matters for *programmatic* reads → Phase 3
  `stream` mode covers that.
- **Don't enable omo's `tmux.enabled`** — it would fight for the same child sessions
  with tmux panes. Our plugin is the Herdr analogue of that feature.
- **Coexistence with `herdr-subagent-status`**: keep it as the lightweight always-on
  overlay (different `--source`); this plugin is the opt-in deep-dive. They don't conflict.
- `project-oracle` is not an omo agent (no hits in the v4.19.3 source) — it's an
  externally-defined agent mistakenly added to the kiro preset (per prior handoff).
  Expect no delegations to it; consider `opm preset set kiro ProjectOracle --clear`.

## Phases

**Phase 0 — spike (manual, ~30 min, needs a human inside Herdr):**
1. Launch opencode with a fixed port inside a herdr pane; run a real delegation prompt.
2. From another pane: confirm child session id appears (`/session` API or storage dir),
   then `herdr pane split` + `pane run "opencode attach ..."` by hand.
3. Confirm: attach shows the live subagent transcript; herdr sidebar shows the pane;
   scroll/replay works; pane survives subagent completion.
   This de-risks everything before writing code.

**Phase 1 — MVP Plugin A:** `session.created`→spawn (split placement only), attach,
report-metadata, `keep` lifecycle. Register in the `subagent-harness` opm profile only.

**Phase 2 — config + tabs + lifecycle:** full config schema, `placement: tab`,
`close_on_done`/ttl, `report-agent-session` restore refs, max_panes guard,
include/exclude filters. Amend Part 1 setup script for fixed ports.

**Phase 3 — sidebar tree (Plugin B) + `stream` mode:** agent.view.set projection and
row templates; optional read-only plaintext streamer (subscribe to the server's
`/event` SSE or poll `session.messages`) for herdr-native scrollback/`pane read`.

**Phase 4 — verification & rollout:** run the old handoff's Part 1 distinct-task check;
then the full delegation matrix (oracle, momus, explore, librarian, metis,
sisyphus-junior, multimodal-looker); promote plugin registration to real opm profiles.

## Repo layout (this repo)

```
herdr-oh-my/
  PLAN.md                      # this file
  packages/herdr-subagent-panes/   # Plugin A (bun + @opencode-ai/plugin 1.15.13)
    index.ts  package.json
  packages/herdr-omo-sidebar/      # Plugin B
    herdr-plugin.toml  bin/...
  scripts/spike-phase0.sh          # manual spike helper (run inside Herdr)
```

## Key references

- omo tmux-subagent: `packages/omo-opencode/src/features/tmux-subagent/` (manager.ts,
  session-created-handler.ts, action-executor.ts), config schema `config/schema/tmux.ts`
- omo delegation: `packages/omo-opencode/src/tools/delegate-task/` + its AGENTS.md
- omo event surface: `plugin/event-hook-dispatcher.ts`, `plugin/event-session-lifecycle.ts`
- herdr API schema: `src/api/schema/{agents,events,panes,plugins}.rs`; handlers
  `src/app/api/panes.rs:1206-1435`; plugin manifest `src/app/api/plugins/manifest.rs`
- herdr docs: docs/next/website/src/content/docs/{socket-api,plugins,agents,agent-automation}.mdx
- herdr agent-view projections: `src/api/schema/agents.rs:49-161` (`agent.view.set`)
- Safety: herdr control commands only from inside a Herdr pane (`HERDR_ENV=1`);
  hand Phase 0 commands to the human.
