// Merges the Claude Deck hook wiring into ~/.claude/settings.json.
//
// This edits the user's live Claude Code config, so it is deliberately careful:
// it backs the file up first, only ever adds its own entries, and never touches
// a hook it did not write. `--remove` reverses it exactly.
//
//   node tools/install-hooks.mjs            # install (or repair)
//   node tools/install-hooks.mjs --remove   # take them back out
//   node tools/install-hooks.mjs --dry-run  # print the result, write nothing
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.join(os.homedir(), ".claude", "settings.json");
const OURS = JSON.parse(fs.readFileSync(path.join(HERE, "hooks.json"), "utf8")).hooks;
const URL_MARK = "127.0.0.1:45822";

const remove = process.argv.includes("--remove");
const dry = process.argv.includes("--dry-run");

let settings = {};
if (fs.existsSync(SETTINGS)) {
  const raw = fs.readFileSync(SETTINGS, "utf8");
  try {
    settings = JSON.parse(raw);
  } catch (e) {
    // Better to stop than to overwrite a config we failed to understand.
    console.error(`refusing to touch ${SETTINGS}: it is not valid JSON (${e.message})`);
    process.exit(1);
  }
  if (!dry) {
    const bak = `${SETTINGS}.bak-claude-deck`;
    fs.copyFileSync(SETTINGS, bak);
    console.log(`backed up -> ${bak}`);
  }
}

settings.hooks ??= {};
// Identify our entries by the loopback URL rather than by position, so a
// reinstall repairs rather than duplicates and a --remove can't take someone
// else's hook with it.
const isOurs = (entry) =>
  JSON.stringify(entry ?? "").includes(URL_MARK);

let added = 0, dropped = 0;
for (const event of new Set([...Object.keys(OURS), ...Object.keys(settings.hooks)])) {
  const existing = (settings.hooks[event] ?? []).filter((e) => {
    if (isOurs(e)) { dropped++; return false; }
    return true;
  });
  const wanted = remove ? [] : (OURS[event] ?? []);
  added += wanted.length;
  const merged = [...existing, ...wanted];
  if (merged.length) settings.hooks[event] = merged;
  else delete settings.hooks[event];
}
if (!Object.keys(settings.hooks).length) delete settings.hooks;

const out = JSON.stringify(settings, null, 2) + "\n";
if (dry) {
  console.log(out);
  console.log(`(dry run) would remove ${dropped} existing Claude Deck hook(s), add ${added}`);
} else {
  fs.writeFileSync(SETTINGS, out);
  console.log(remove
    ? `removed ${dropped} Claude Deck hook(s) from ${SETTINGS}`
    : `wrote ${added} Claude Deck hook(s) to ${SETTINGS} (replaced ${dropped})`);
  console.log("Existing Claude Code sessions pick up settings changes on their next turn.");
}
