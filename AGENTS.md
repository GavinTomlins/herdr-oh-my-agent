# AGENTS.md — operating guide for coding agents

Instructions for an agent asked to install, configure, verify, or debug this
plugin on a user's machine. Read README.md first for the human-level overview.

## What this repository is

An OpenCode plugin (`packages/herdr-subagent-panes/`) that mirrors every
oh-my-openagent subagent delegation into its own Herdr pane or tab by running
`opencode attach --session <child-session-id>`, plus a Herdr plugin manifest
(`herdr-plugin.toml`) that packages installation and registration.

Key facts you should not re-derive:

- omo delegations create real child OpenCode sessions (`parentID` set). This
  plugin observes `session.created` events; it never alters delegation and
  never executes anything twice.
- The plugin no-ops unless `HERDR_PANE_ID` is present in opencode's
  environment (i.e. opencode runs inside a Herdr-managed pane).
- All `herdr` CLI calls are wrapped in a 5s timeout and swallow failures by
  design; the debug log is the only place failures surface.

## Safety rules

1. **Never run Herdr control/inspect commands from outside a Herdr pane.**
   Check `test "${HERDR_ENV:-}" = "1"` first. If it fails, hand the command to
   the user instead of running it.
2. **Never kill a running opencode process without checking with the user** —
   it may be mid-orchestration. Sessions persist on disk, but in-flight work
   is interrupted.
3. **Always back up `opencode.json` before modifying it.** The provided
   `scripts/register-opencode-plugin.mjs` does this automatically — prefer it
   over hand-editing. Some real-world configs are not strictly parseable JSON
   (comments, embedded control characters); the script handles that with a
   textual splice fallback. Do not naively parse-and-rewrite the file.

## Install procedure

```bash
# 1. Dependencies for the OpenCode plugin
bun install --cwd packages/herdr-subagent-panes

# 2. Sanity: typecheck must pass
cd packages/herdr-subagent-panes && bunx tsc --noEmit --strict --target es2022 \
  --moduleResolution bundler --module esnext --lib es2022,dom --types bun index.ts

# 3. Register in opencode.json (idempotent, takes a backup)
bun scripts/register-opencode-plugin.mjs
#    Remove later with: bun scripts/register-opencode-plugin.mjs --remove
```

If installed through Herdr instead (`herdr plugin install
GavinTomlins/herdr-oh-my-agent`), step 1 runs automatically at install time and
step 3 is the manifest action
`gavintomlins.herdr-oh-my-agent.register`.

Registration honors `OPENCODE_CONFIG`; otherwise it edits
`~/.config/opencode/opencode.json`. A restart of opencode is required —
plugins load at startup only.

## Configuration surface

Environment variables read once when opencode starts (full table in
README.md): `HERDR_SUBAGENT_PANES`, `HERDR_SUBAGENT_PLACEMENT` (split|tab),
`HERDR_SUBAGENT_RATIO`, `HERDR_SUBAGENT_LIFECYCLE` (keep|close_on_done),
`HERDR_SUBAGENT_MAX_PANES`.

OpenCode must be launched with a fixed port (`opencode --port 4096`) so the
attach URL the plugin builds from `serverUrl` is reachable.

## Verification procedure

1. Confirm registration: the absolute path of `packages/herdr-subagent-panes`
   appears in the `plugin` array of the opencode config.
2. Have the user (or a Herdr-hosted agent) restart opencode inside a Herdr
   pane: `HERDR_SUBAGENT_PLACEMENT=tab opencode --port 4096`.
3. Check the decision log:
   `cat ~/.local/share/herdr-subagent-panes/plugin.log`
   - `active: pane=<id> …` → loaded and armed. Proceed.
   - `loaded but disabled: HERDR_PANE_ID not set` → opencode is not inside a
     Herdr pane.
   - No file → plugin not loaded; re-check registration and the restart.
4. Trigger a real delegation. Coordinators refuse artificial busywork, so use
   a small genuine task, e.g.:
   "Delegate to the oracle subagent: read README.md and give a one-paragraph
   assessment of its structure."
5. Expected log sequence:
   `event session.created: id=ses_… parentID=ses_…` → `mirroring ses_…` →
   `spawned pane <pane-id> (agent=oracle)`, and a pane/tab appears in Herdr.
   `parentID=none` means the prompt did not delegate — pick a stronger prompt,
   not a different plugin configuration.
6. Failure lines carry the exact cause: `herdr exit <code> … :: <stderr>`,
   `herdr timeout`, or `spawn failed`. Fix what they name (herdr not on PATH,
   pane id stale, etc.) rather than guessing.

## File map

| Path | Purpose |
|---|---|
| `packages/herdr-subagent-panes/index.ts` | The entire OpenCode plugin (single file) |
| `packages/herdr-subagent-panes/README.md` | Plugin-level docs |
| `scripts/register-opencode-plugin.mjs` | Safe opencode.json registration/unregistration |
| `herdr-plugin.toml` | Herdr manifest: build + register/unregister actions |
| `PLAN.md` | Design rationale, constraints, phased roadmap |

## Editing the plugin

- Keep the no-op guards (missing `HERDR_PANE_ID`, disabled flag) and the
  timeout wrapper around every herdr call — delegation must never be able to
  fail because of this plugin.
- Log every new decision path via the existing `log()` helper; the log file is
  the only observable surface when things go wrong.
- After changes: re-run the typecheck command above, then the smoke test:
  `HERDR_PANE_ID=w0:p0 bun -e 'console.log(Object.keys(await (await
  import("./index.ts")).HerdrSubagentPanes({ $: () => {}, client: {},
  serverUrl: new URL("http://localhost:4096"), directory: "/tmp" })))'`
  — must print `["event"]`, and `[]` when `HERDR_PANE_ID` is unset.
- Version bumps go in both `packages/herdr-subagent-panes/package.json` and
  `herdr-plugin.toml`.
