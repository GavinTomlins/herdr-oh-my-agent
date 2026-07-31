#!/usr/bin/env bun
// Registers (or with --remove, unregisters) the bundled OpenCode plugin in
// the user's opencode.json `plugin` array. Idempotent; always writes a
// timestamped backup before modifying. Tolerates configs that are not
// strictly parseable JSON by falling back to a conservative string splice.

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const remove = process.argv.includes("--remove");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = join(repoRoot, "packages", "herdr-subagent-panes");

const configPath =
  process.env.OPENCODE_CONFIG ||
  join(homedir(), ".config", "opencode", "opencode.json");

if (!existsSync(pluginPath)) {
  console.error(`plugin package not found at ${pluginPath}`);
  process.exit(1);
}

if (!existsSync(configPath)) {
  if (remove) {
    console.log(`nothing to do: ${configPath} does not exist`);
    process.exit(0);
  }
  writeFileSync(
    configPath,
    JSON.stringify(
      { $schema: "https://opencode.ai/config.json", plugin: [pluginPath] },
      null,
      2,
    ) + "\n",
  );
  console.log(`created ${configPath} with plugin registered`);
  process.exit(0);
}

const original = readFileSync(configPath, "utf8");
const registered = original.includes(pluginPath);

if (!remove && registered) {
  console.log(`already registered in ${configPath}`);
  process.exit(0);
}
if (remove && !registered) {
  console.log(`not registered in ${configPath}; nothing to do`);
  process.exit(0);
}

const backupPath = `${configPath}.bak.${new Date()
  .toISOString()
  .replace(/[:.]/g, "-")}`;
copyFileSync(configPath, backupPath);

let updated;
let parsed;
try {
  parsed = JSON.parse(original);
} catch {
  parsed = undefined;
}

if (parsed && typeof parsed === "object") {
  const plugins = Array.isArray(parsed.plugin) ? parsed.plugin : [];
  parsed.plugin = remove
    ? plugins.filter((entry) => entry !== pluginPath)
    : [...plugins, pluginPath];
  updated = JSON.stringify(parsed, null, 2) + "\n";
} else {
  // Config is not plain JSON (comments, control characters, ...). Splice the
  // entry in or out of the existing "plugin" array textually.
  if (remove) {
    const entryPattern = new RegExp(
      `\\s*"${pluginPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",?`,
    );
    if (!entryPattern.test(original)) {
      console.error(`could not locate registered entry to remove in ${configPath}`);
      process.exit(1);
    }
    updated = original.replace(entryPattern, "");
  } else {
    const emptyArray = /("plugin"\s*:\s*\[)(\s*)\]/;
    const openArray = /("plugin"\s*:\s*\[)/;
    if (emptyArray.test(original)) {
      updated = original.replace(emptyArray, `$1\n    "${pluginPath}"\n  ]`);
    } else if (openArray.test(original)) {
      updated = original.replace(openArray, `$1\n    "${pluginPath}",`);
    } else {
      console.error(
        `no "plugin" array found in ${configPath} and it is not parseable JSON; ` +
          `add this path to the plugin array manually:\n  ${pluginPath}`,
      );
      process.exit(1);
    }
  }
}

writeFileSync(configPath, updated);
console.log(
  `${remove ? "unregistered from" : "registered in"} ${configPath} (backup: ${backupPath})`,
);
console.log("restart opencode for the change to take effect");
