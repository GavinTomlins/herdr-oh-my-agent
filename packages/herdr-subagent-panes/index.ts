import type { Plugin } from "@opencode-ai/plugin";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Mirrors every oh-my-openagent subagent delegation into its own Herdr pane
// or tab by attaching to the real child OpenCode session with
// `opencode attach --session <id>`. Observation only — native task-tool
// delegation is untouched, and there is no double execution: the pane shows
// the genuine session, which persists on disk and stays re-attachable.
//
// No-ops entirely when not running inside a Herdr-managed pane
// (HERDR_PANE_ID unset) or when the herdr binary is unavailable. Herdr
// calls are best-effort with timeouts — they must never affect delegation.
//
// Config (env vars, read once at plugin load):
//   HERDR_SUBAGENT_PANES=0            disable entirely
//   HERDR_SUBAGENT_PLACEMENT=tab      new tab per subagent (default: split)
//   HERDR_SUBAGENT_RATIO=0.4          split ratio (split placement only)
//   HERDR_SUBAGENT_LIFECYCLE=close_on_done   close pane when subagent goes
//                                     idle (default: keep, for review)
//   HERDR_SUBAGENT_MAX_PANES=8        cap on concurrent mirror panes

const SOURCE = "oh-my-openagent:subagent";
const HERDR_TIMEOUT_MS = 5000;
const SESSION_READY_ATTEMPTS = 10;
const SESSION_READY_DELAY_MS = 300;

// Debug log — confirms the plugin loaded and records every decision.
// Tail it with: tail -f ~/.local/share/herdr-subagent-panes/plugin.log
const LOG_DIR = join(homedir(), ".local", "share", "herdr-subagent-panes");
const LOG_FILE = join(LOG_DIR, "plugin.log");
let logDirReady = false;
const log = (message: string) => {
  try {
    if (!logDirReady) {
      mkdirSync(LOG_DIR, { recursive: true });
      logDirReady = true;
    }
    appendFileSync(LOG_FILE, `${new Date().toISOString()} [pid ${process.pid}] ${message}\n`);
  } catch {
    // logging must never break the plugin
  }
};

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const HerdrSubagentPanes: Plugin = async ({ $, client, serverUrl, directory }) => {
  const hostPaneId = env("HERDR_PANE_ID");
  const workspaceId = env("HERDR_WORKSPACE_ID");
  if (!hostPaneId) {
    log("loaded but disabled: HERDR_PANE_ID not set (not inside a Herdr pane)");
    return {};
  }
  if (env("HERDR_SUBAGENT_PANES") === "0") {
    log("loaded but disabled: HERDR_SUBAGENT_PANES=0");
    return {};
  }

  const placement = env("HERDR_SUBAGENT_PLACEMENT") === "tab" ? "tab" : "split";
  const ratio = Number(env("HERDR_SUBAGENT_RATIO") ?? "0.4") || 0.4;
  const lifecycle = env("HERDR_SUBAGENT_LIFECYCLE") === "close_on_done" ? "close_on_done" : "keep";
  const maxPanes = Number(env("HERDR_SUBAGENT_MAX_PANES") ?? "8") || 8;

  const attachUrl = serverUrl.toString().replace(/\/+$/, "");

  log(
    `active: pane=${hostPaneId} workspace=${workspaceId ?? "?"} placement=${placement} ` +
      `lifecycle=${lifecycle} attachUrl=${attachUrl} dir=${directory}`,
  );

  const seenSessions = new Set<string>();
  const panesBySession = new Map<string, string>();

  // Bun's $ escapes each interpolated array element as its own argv entry,
  // so no manual shell quoting is needed for the herdr invocation itself.
  const herdr = async (args: string[]): Promise<any | undefined> => {
    try {
      const result = await Promise.race([
        $`herdr ${args}`.quiet().nothrow(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), HERDR_TIMEOUT_MS)),
      ]);
      if (!result) {
        log(`herdr timeout (${HERDR_TIMEOUT_MS}ms): herdr ${args.join(" ")}`);
        return undefined;
      }
      if (result.exitCode !== 0) {
        log(
          `herdr exit ${result.exitCode}: herdr ${args.join(" ")} :: ` +
            result.stderr.toString().trim().slice(0, 300),
        );
        return undefined;
      }
      const text = result.stdout.toString().trim();
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    } catch (error) {
      log(`herdr threw: herdr ${args.join(" ")} :: ${String(error).slice(0, 300)}`);
      return undefined;
    }
  };

  // omo titles child sessions "<description> (@<agent> subagent)".
  const agentFromTitle = (title: string | undefined): string => {
    const match = title?.match(/\(@(.+?) subagent\)\s*$/);
    const raw = match?.[1] ?? "subagent";
    return raw.toLowerCase().replace(/[^a-z0-9:._-]+/g, "-").slice(0, 40) || "subagent";
  };

  const spawnPane = async (label: string): Promise<string | undefined> => {
    if (placement === "tab") {
      const args = ["tab", "create", "--label", label, "--no-focus"];
      if (workspaceId) args.push("--workspace", workspaceId);
      const response = await herdr(args);
      return response?.result?.root_pane?.pane_id;
    }
    const response = await herdr([
      "pane", "split", hostPaneId,
      "--direction", "right",
      "--ratio", String(ratio),
      "--no-focus",
    ]);
    return response?.result?.pane?.pane_id;
  };

  const mirrorSession = async (info: {
    id?: string;
    parentID?: string;
    title?: string;
    directory?: string;
  }) => {
    const sessionId = info.id;
    if (!sessionId || !info.parentID || seenSessions.has(sessionId)) return;
    seenSessions.add(sessionId);
    if (panesBySession.size >= maxPanes) {
      log(`skip ${sessionId}: max panes (${maxPanes}) reached`);
      return;
    }
    log(`mirroring ${sessionId} parent=${info.parentID} title="${info.title ?? ""}"`);

    const agent = agentFromTitle(info.title);

    // Attaching before the server can serve the session makes the attach
    // client exit immediately and the pane close (omo issue #3505) — wait
    // until the session is queryable first.
    for (let attempt = 0; attempt < SESSION_READY_ATTEMPTS; attempt++) {
      const got: any = await client.session
        .get({ path: { id: sessionId } })
        .catch(() => undefined);
      if (got?.data ?? got) break;
      await new Promise((resolve) => setTimeout(resolve, SESSION_READY_DELAY_MS));
    }

    const paneId = await spawnPane(agent);
    if (!paneId) {
      log(`spawn failed for ${sessionId} (agent=${agent}) — no pane id in herdr response`);
      return;
    }
    log(`spawned pane ${paneId} for ${sessionId} (agent=${agent})`);
    panesBySession.set(sessionId, paneId);

    // pane run types this into the new pane's shell, so quote the directory.
    const dir = info.directory ?? directory;
    await herdr([
      "pane", "run", paneId,
      `opencode attach ${attachUrl} --session ${sessionId} --dir "${dir}"`,
    ]);

    const metadataArgs = [
      "pane", "report-metadata", paneId,
      "--source", SOURCE,
      "--display-agent", agent,
      "--token", `parent=${hostPaneId}`,
      "--token", `session=${sessionId}`,
    ];
    if (info.title) metadataArgs.push("--title", info.title.slice(0, 80));
    await herdr(metadataArgs);

    await herdr([
      "pane", "report-agent-session", paneId,
      "--source", SOURCE,
      "--agent", agent,
      "--agent-session-id", sessionId,
    ]);
  };

  const handleSessionDone = async (sessionId: string | undefined) => {
    if (!sessionId) return;
    const paneId = panesBySession.get(sessionId);
    if (!paneId) return;
    if (lifecycle === "close_on_done") {
      panesBySession.delete(sessionId);
      await herdr(["pane", "close", paneId]);
    }
  };

  return {
    event: async ({ event }) => {
      const type = (event as any)?.type as string | undefined;
      const props = (event as any)?.properties;
      if (type === "session.created" || type === "session.updated") {
        const info = props?.info;
        if (type === "session.created") {
          log(`event ${type}: id=${info?.id} parentID=${info?.parentID ?? "none"}`);
        }
        if (info) await mirrorSession(info);
      } else if (type === "session.idle") {
        await handleSessionDone(props?.sessionID ?? props?.info?.id);
      } else if (type === "session.deleted") {
        await handleSessionDone(props?.info?.id ?? props?.sessionID);
      }
    },
  };
};

export default HerdrSubagentPanes;
