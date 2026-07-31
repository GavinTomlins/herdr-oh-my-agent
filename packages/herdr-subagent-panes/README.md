# herdr-subagent-panes

OpenCode plugin that mirrors every oh-my-openagent subagent delegation into
its own Herdr pane (or tab) by attaching to the real child OpenCode session:

```
opencode attach <serverUrl> --session <childSessionId> --dir <projectDir>
```

Observation only — omo's native delegation is untouched and nothing executes
twice. Each pane shows the genuine subagent session (live while it works, full
transcript replay afterwards), and sessions persist on disk so panes can be
re-attached any time.

See the [repository README](../../README.md) for installation, usage examples,
and troubleshooting, and [AGENTS.md](../../AGENTS.md) for agent-operable
install/verify procedures.

## Requirements

- Running inside a Herdr-managed pane (`HERDR_PANE_ID` set — otherwise the
  plugin silently no-ops).
- `herdr` on PATH inside the pane.
- OpenCode launched with a **fixed port** so the attach URL resolves, e.g.
  `opencode --port 4096`.
- omo's own tmux mirroring stays **disabled** (`tmux.enabled: false`, the
  default) — this plugin is its Herdr analogue.

## Install / register

```bash
bun install --cwd .                      # from this directory
bun ../../scripts/register-opencode-plugin.mjs   # adds this path to opencode.json
```

Or add this directory's absolute path to the `plugin` array of your
`opencode.json` manually. Restart opencode afterwards — plugins load at
startup only.

## Configuration (env vars, read at plugin load)

| Variable | Default | Meaning |
|---|---|---|
| `HERDR_SUBAGENT_PANES` | `1` | `0` disables entirely |
| `HERDR_SUBAGENT_PLACEMENT` | `split` | `tab` = new tab per subagent; `split` = pane beside the orchestrator |
| `HERDR_SUBAGENT_RATIO` | `0.4` | split ratio (split placement only) |
| `HERDR_SUBAGENT_LIFECYCLE` | `keep` | `close_on_done` closes the pane when the subagent goes idle |
| `HERDR_SUBAGENT_MAX_PANES` | `8` | cap on mirror panes (guards delegation fan-out storms) |

With `keep` (default) panes stay open for review; max-panes slots are then
only freed on session deletion, so heavy orchestrations may want
`close_on_done` or a higher cap.

## How it works

1. `event` hook: `session.created` (or first `session.updated`) with a
   `parentID` → a subagent was delegated.
2. Waits until the server can serve the child session (attaching too early
   makes the attach client exit and the pane close).
3. `herdr pane split` / `herdr tab create` (`--no-focus`), reads the new pane
   id from the JSON response.
4. `herdr pane run <paneId> "opencode attach ..."`.
5. Reports metadata: `--display-agent <subagent>`, tokens `parent`/`session`,
   and `report-agent-session` with the OpenCode session id so Herdr's native
   restore can revive the pane.
6. `session.idle`/`session.deleted` → optional pane close per lifecycle
   config.

All herdr calls are best-effort: 5s timeout, `.nothrow().quiet()`, failures
never affect delegation. Every decision is appended to
`~/.local/share/herdr-subagent-panes/plugin.log`.

## Verify (inside a Herdr pane)

```bash
HERDR_SUBAGENT_PLACEMENT=tab opencode --port 4096
```

Then give the orchestrator a real task that delegates (e.g. "Delegate to the
oracle subagent: read README.md and assess its structure"). A new tab/pane
should appear within ~2s of delegation. Trivial-sounding test prompts can be
refused as busywork — use a plausible small task.
