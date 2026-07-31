# herdr-oh-my-agent

**See every oh-my-openagent subagent working live, each in its own [Herdr](https://herdr.dev) pane or tab — with full session state and scrollback.**

[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (a.k.a. *oh-my-agent* / *omo*) turns [OpenCode](https://opencode.ai) into an orchestrated team: a coordinator agent (sisyphus, atlas, …) delegates work to specialist subagents (oracle, momus, explore, librarian, sisyphus-junior, …). Normally those delegations are invisible — you watch a single pane that just says "working", or you walk the session tree by hand (`Ctrl+X` + arrow keys) after the fact.

This plugin makes the whole team visible. The moment a delegation starts, the subagent's session appears in its own Herdr pane or tab, streaming live. When it finishes, the pane stays (configurable) with the complete transcript — scroll back through everything the subagent did, whenever you like.

```
┌─ orchestrator ─────────┐┌─ oracle ────────────────┐
│ sisyphus: delegating   ││ reviewing index.ts ...  │
│ ARCH-014 review to     ││ > read file             │
│ oracle + explore ...   ││ > the event handling is │
│                        ││   sound because ...     │
│                        │└─────────────────────────┘
│                        │┌─ explore ───────────────┐
│                        ││ mapping repo layout ... │
└────────────────────────┘└─────────────────────────┘
```

## How it works

Every omo delegation creates a **real child OpenCode session** on the OpenCode server. This plugin (an OpenCode plugin) listens for those sessions being created and, for each one:

1. Creates a Herdr split or tab next to your orchestrator (never stealing focus).
2. Runs `opencode attach --session <child-session-id>` in it — the pane shows the *actual* subagent session, live.
3. Reports the agent's name, task, and session id to Herdr, so the Agents sidebar tracks it and Herdr's session restore can revive the pane later.

Nothing about delegation itself changes and nothing executes twice — this is pure observation of sessions that already exist. Sessions persist on disk, so panes can be closed and re-attached at any time, even days later.

## Requirements

| Requirement | Why |
|---|---|
| [Herdr](https://herdr.dev/docs/install/) ≥ 0.7.5 | The terminal multiplexer hosting the panes |
| [OpenCode](https://opencode.ai) ≥ 1.18 | Provides `opencode attach --session` |
| [oh-my-openagent](https://omo.dev/docs) ≥ 4.19 | The orchestration layer whose delegations are mirrored |
| [Bun](https://bun.sh) | Runs the OpenCode plugin |
| OpenCode launched with a **fixed port** | So attach URLs are resolvable (see Usage) |

Keep omo's own tmux mirroring disabled (`tmux.enabled: false` — the default). This plugin is its Herdr equivalent; running both would fight over the same sessions.

## Install

### Via the Herdr plugin system (recommended)

```bash
herdr plugin install GavinTomlins/herdr-oh-my-agent
```

The install preview shows the manifest and build command (`bun install` for the bundled OpenCode plugin). Then register the OpenCode plugin into your `opencode.json`:

```bash
herdr plugin action invoke gavintomlins.herdr-oh-my-agent.register
```

The register action is idempotent and takes a timestamped backup of `opencode.json` before touching it. `…unregister` reverses it.

### Manual

```bash
git clone https://github.com/GavinTomlins/herdr-oh-my-agent
cd herdr-oh-my-agent
bun install --cwd packages/herdr-subagent-panes
bun scripts/register-opencode-plugin.mjs
```

Or add the absolute path of `packages/herdr-subagent-panes` to the `plugin` array of your `opencode.json` yourself.

## Usage

Inside a Herdr pane, launch OpenCode with a fixed port:

```bash
opencode --port 4096
```

That's it for the default setup (splits beside the orchestrator, panes kept for review). To choose tabs instead:

```bash
HERDR_SUBAGENT_PLACEMENT=tab opencode --port 4096
```

Then work normally. Any prompt that causes the orchestrator to delegate will pop a live pane/tab per subagent.

### Prompts that demonstrate it

A single delegation (a real, reviewable task — coordinators refuse busywork):

> Delegate to the oracle subagent: review packages/herdr-subagent-panes/index.ts and assess whether the event handling is sound.

Two subagents in parallel — two panes appear near-simultaneously:

> Use the explore subagent to map the structure of this repo, and separately delegate to the oracle subagent to assess README.md. Run both.

The full fan-out — prefix a real task with omo's `ulw`/`ultrawork` keyword, which pushes the orchestrator toward multiple specialist delegations:

> ulw Review this repository and identify gaps before the next release.

Trivial questions ("what is today?") are answered directly by the orchestrator without delegating — no subagent, no pane. That's correct behavior, not a plugin failure.

### Configuration

Set env vars where you launch `opencode`:

| Variable | Default | Meaning |
|---|---|---|
| `HERDR_SUBAGENT_PANES` | `1` | `0` disables the plugin entirely |
| `HERDR_SUBAGENT_PLACEMENT` | `split` | `split` = pane beside the orchestrator; `tab` = new tab per subagent |
| `HERDR_SUBAGENT_RATIO` | `0.4` | Split ratio (split placement only) |
| `HERDR_SUBAGENT_LIFECYCLE` | `keep` | `keep` leaves panes open for review; `close_on_done` closes them when the subagent finishes |
| `HERDR_SUBAGENT_MAX_PANES` | `8` | Cap on mirror panes, guarding against delegation storms |

Notes on behavior:

- **Panes are per-session, not per-agent.** Three oracle delegations = three panes, each with its own complete transcript. Busy orchestrations may prefer `close_on_done` or a higher cap.
- Outside Herdr (no `HERDR_PANE_ID` in the environment) the plugin no-ops completely.
- All Herdr calls are best-effort with timeouts — a missing `herdr` binary or a failed call can never affect the delegation itself.
- Scroll inside the attach pane to read the full transcript (the attach client replays session history). Herdr's own `pane read` sees only the visible viewport of full-screen apps.

## Troubleshooting

The plugin writes a decision log to `~/.local/share/herdr-subagent-panes/plugin.log`:

```bash
tail -f ~/.local/share/herdr-subagent-panes/plugin.log
```

| Symptom | Meaning / fix |
|---|---|
| No log file after starting opencode | Plugin not loaded — check the `plugin` array in `opencode.json`, restart opencode (plugins load at startup only) |
| `loaded but disabled: HERDR_PANE_ID not set` | opencode isn't running inside a Herdr-managed pane |
| `active: …` but no pane on delegation | Check the log for `herdr exit …` lines — they include herdr's stderr. Verify `herdr` is on PATH in that pane |
| opencode hangs at launch with no output | The port is already taken by an earlier instance — `lsof -nP -iTCP:4096 -sTCP:LISTEN`, then quit or `kill` it |
| `session.created … parentID=none` only | Your prompt didn't cause a delegation — see the example prompts above |
| Pane appears then instantly closes | The attach raced session creation; the plugin waits for session readiness, but if it recurs, raise `SESSION_READY_ATTEMPTS` in the plugin and please open an issue |

## The ecosystem

- **Herdr** — mouse-first terminal multiplexer with native coding-agent awareness. [Docs](https://herdr.dev/docs/) · [GitHub](https://github.com/herdrdev/herdr) · [Agents guide](https://herdr.dev/docs/agents/) · [Plugin system](https://herdr.dev/docs/plugins/)
- **oh-my-openagent (oh-my-agent / omo)** — multi-agent orchestration for OpenCode: planning, delegation with evidence requirements, model routing per task category. [Docs](https://omo.dev/docs) · [GitHub](https://github.com/code-yeongyu/oh-my-openagent)
- **OpenCode** — the agent platform both build on; its sessions, server API, and `attach` command make this plugin possible. [Site](https://opencode.ai)

## Roadmap

- **Sidebar tree view** — a Herdr-side companion that renders orchestrator → subagent nesting in the Agents sidebar via metadata tokens and `agent.view.set` projections.
- **Stream mode** — an alternative read-only plaintext transcript pane (line-oriented, so Herdr-native scrollback and `pane read` work on it).
- **Per-agent tab reuse** — optionally re-attach one long-lived tab per agent name instead of one tab per session.

## Repository layout

```
herdr-plugin.toml                    Herdr plugin manifest (build + register/unregister actions)
packages/herdr-subagent-panes/       The OpenCode plugin (Bun + TypeScript)
scripts/register-opencode-plugin.mjs Adds/removes the plugin in opencode.json safely
AGENTS.md                            Instructions for coding agents installing or operating this plugin
PLAN.md                              Design notes and roadmap detail
```

## License

[Apache-2.0](LICENSE) © Gavin Tomlins
