# Demo recordings

The README's two GIFs are recorded with [vhs](https://github.com/charmbracelet/vhs)
driving a real, throwaway Herdr session named `gifdemo` — separate from any
session you have open.

```bash
brew install vhs                    # once
cd <repo root>                      # tapes use repo-relative paths
vhs assets/tapes/demo-split.tape    # -> assets/demo.gif
vhs assets/tapes/demo-tabs.tape     # -> assets/demo-tabs.gif

# tear the throwaway session down afterwards
HERDR_SESSION=gifdemo herdr server stop
rm -rf ~/.config/herdr/sessions/gifdemo
```

## What's here

| File | Role |
|---|---|
| `demo-split.tape` / `demo-tabs.tape` | vhs scripts: window size, font, and when recording becomes visible |
| `driver-split.sh` / `driver-tabs.sh` | Choreography — creates panes/tabs and reports agent status through the Herdr CLI, mimicking what the plugin does at runtime |
| `orchestrator.sh`, `oracle.sh`, `explore.sh` | Pane contents |

The pane/split/tab creation and the agent-sidebar status transitions are
genuine Herdr behavior. The text inside each pane is scripted, standing in for
model output — recording live delegations would produce an unreproducible
multi-minute clip.

## Gotchas

- vhs `Output` rejects absolute paths; keep it repo-relative and run vhs from
  the repo root.
- The tapes `Hide` the first ~7 seconds so shell startup noise stays out of
  the recording; the drivers' first `sleep` is timed to match.
- Line lengths in the pane scripts are tuned to the split-pane widths. Widen
  the text and it will wrap mid-word in `demo.gif`.
