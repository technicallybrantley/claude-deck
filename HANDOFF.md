# Handoff notes for future agents

This file is for whoever (human or agent) next touches this repo. The
README is the user-facing doc; this is the "what you'd otherwise have to
rediscover" doc. Keep it updated when you learn something the hard way.

## Repo shape

- `src/plugin.js` — the actual source. Edit this, never the bundle.
- `com.technicallybrantley.claude-deck.sdPlugin/bin/plugin.mjs` — esbuild
  output, checked in because Stream Deck loads directly from the installed
  plugin folder. Regenerate with `npm run build`; don't hand-edit it.
- `com.technicallybrantley.claude-deck.sdPlugin/manifest.json` — action
  definitions Stream Deck reads. Bump `"Version"` (4-part, e.g. `1.0.1.0`)
  on any behavior change so old cached state doesn't get confused with new.
- `tools/make-chart-profile.mjs` — generates `Claude 7-Day Chart.streamDeckProfile`
  inside the sdPlugin folder. Runs as part of `npm run build`; see the profile
  section below before touching it.
- `deploy.ps1` — stops Stream Deck, replaces the installed plugin folder
  with a fresh copy of `com.technicallybrantley.claude-deck.sdPlugin/`,
  restarts it. This is Windows-only (PowerShell) — use the `PowerShell`
  tool, not `Bash`, to run it.
- `docs/*.png` — README screenshots. `local-assets/claude-logo.png` is
  gitignored (personal-use icon override); `deploy.ps1` copies it over the
  SVG launcher/category icons if present.

## Build → deploy → verify loop

```powershell
npm run build       # src/plugin.js -> bin/plugin.mjs
npm run selftest     # runs the plugin's poll functions headless, prints results
.\deploy.ps1          # installs to %APPDATA%\Elgato\...\Plugins\, restarts Stream Deck
```

`selftest` is the fast feedback loop — it calls `pollUsage`/`pollToday`/
`pollBurn` directly and dumps JSON, no physical Stream Deck needed. Always
run it before `deploy.ps1` to catch logic errors without a restart cycle.
The usage-limit endpoint selftest checks can 429 if you just hit it (client
backs off 240s) — that's expected, not a bug.

Debug log at runtime: `%APPDATA%\Elgato\StreamDeck\Plugins\<plugin>\claude-deck.log`.

## The transcript-line dedup gotcha (fixed 2026-07-17/18, commit `ea27c2c`)

This is the thing most likely to bite you again if you touch `pollToday()`
or `pollBurn()` (or add a new poller that reads `~/.claude/projects/**/*.jsonl`):

**One assistant turn writes multiple lines to the transcript.** When a
response streams tool calls, Claude Code appends a new JSONL line per
content block (thinking, then each tool_use) as it arrives — and **every
line repeats that request's full cumulative `usage` object**, not a
per-block increment. So a response with a thinking block + 6 tool calls
writes 7 lines, all carrying identical `usage.output_tokens` /
`cache_read_input_tokens` / etc., all sharing one `requestId`.

Summing `usage` across every line — which is what both pollers originally
did — overcounts by however many content blocks each response had. On a
real session this inflated the displayed total by ~2.5x (804M raw vs 321M
actual on the day this was caught; verified against `ccusage`, which
dedupes correctly, and against the account's real rate-limit meters).

**The fix, and the invariant to preserve:** dedupe by `message.id` (fall
back to `j.requestId` if absent) and take the max usage seen per id, not
the sum. `pollToday()` does this with a `reqTok` Map per file; `pollBurn()`
does it with `rec.seen` Map alongside its event list (needed because it's
an incremental tail-reader across ticks, not a one-shot file scan — a
later snapshot of the same request can revise the totals, so it updates
the existing event in place rather than pushing a new one).

If you write a new feature that reads these transcripts, assume every
`type: "assistant"` line needs this same dedup — it is not specific to
today/burn, it's a property of the log format. `pollWeek()` (the 7-day chart)
is the third place doing it; its per-day bucketing keys the max by
`message.id` *and* the day the id first appeared, so a request never lands in
two columns. Good cross-check when changing any of this: the chart's "today"
column and the Today key are computed independently and must agree exactly.

## The whole-deck 7-day chart (profile takeover)

A plugin can only draw on keys where its own actions sit, so "take over the deck"
means switching to a profile bundled in the `.sdPlugin` folder. What cost time to
work out:

- **`switchToProfile`'s `context` is the *plugin* UUID** (the `-pluginUUID` argv
  value), not the pressed key's context. Passing the key context silently does
  nothing. That's why `pluginUUID` is module-level state now.
- **Omitting `profile` from the payload is the back button.** Stream Deck returns
  to the previously selected profile on its own, so the plugin doesn't have to
  record where the user came from — and it restores the *page*, not just the profile.
- **Bundled profiles install lazily.** Nothing appears in `ProfilesV3` when the
  plugin loads; Stream Deck imports it the first time the profile is needed, and
  logs `ESDProfileOperationImportFromPlugin::importProfile Profile <name> installed`
  to `%APPDATA%\Elgato\StreamDeck\logs\StreamDeck.log`. If a switch seems to do
  nothing, grep that log before suspecting the profile file.
- **Ignore the `Failed to find last selected page ... for umbrella ...` warning**
  that import emits. Stream Deck rewrites every GUID in the profile as it
  imports, and warns while looking up the pre-rewrite page id. Verified after the
  fact: the installed copy under `ProfilesV3` had `Pages.Current` pointing at the
  32-key page, not the blank default. Check the installed copy before "fixing" it.
- **Stream Deck clones the profile per physical device and re-stamps
  `Device.Model` itself.** The generator hardcodes the XL model `20GAT9901`, but
  an XL with a different model id gets its own copy — verified against
  `WinToolsXL`, which is installed twice here, once per XL. Don't add per-device
  logic; `DeviceType` in the manifest is what actually does the matching.
- **A profile is tied to one `DeviceType`** (2 = XL). Supporting a 15-key deck
  means a second profile *and* a second layout — the chart geometry assumes 8x4.
  `chart-open` checks the device type from `deviceDidConnect` and shows an alert
  rather than switching to a profile that doesn't exist.
- **`VisibleInActionsList: false`** keeps `chart-cell` out of the user's action
  list. It's a real manifest property (Elgato's own volume-controller uses it for
  exactly this); it is not in every version of the published schema.
- The bundled profile is **32 identical `chart-cell` instances with empty
  Settings**. Each key works out what to draw from `payload.coordinates` at
  `willAppear`. Don't bake positions into the profile — it makes the generator
  and the renderer two places to keep in sync instead of one.
- Cells are drawn in **whole-column coordinates** (144x576) and each key renders
  the entire column translated by `-row*144`, letting the viewBox clip. That's
  what makes a bar continuous across four keys instead of four stair steps.
- The generator writes a **stored (uncompressed) zip with fixed timestamps and
  fixed GUIDs**, so rebuilding is byte-identical unless the layout changed, and a
  regenerated profile updates the installed one instead of appearing twice.

`npm run preview -- --out chart.svg [--metric msgs]` renders all 32 keys to a
single SVG using real data — the fast way to check layout changes without a deck.
Rasterize with `chrome --headless --screenshot=out.png --window-size=1208,620 file:///...`.

## Usage-limit gauges vs. local transcript data — two different sources

- Session/Weekly/Model gauges hit `GET
  https://api.anthropic.com/api/oauth/usage` (undocumented, OAuth token
  from `~/.claude/.credentials.json`) — this is server-computed truth, same
  numbers `/usage` shows in Claude Code. Trust these over anything derived
  from local files.
- Today/Burn Rate are computed locally from `~/.claude/projects/**/*.jsonl`
  transcripts. This only sees Claude Code activity on **this machine** — it
  undercounts relative to the account-wide gauges above if the user also
  uses Claude Desktop, claude.ai, or Claude Code on another device. That's
  expected and already noted in the README; don't "fix" Today to match the
  gauges by inflating it — the discrepancy is real and directional, not a bug.

## Git push quirk observed on this box

`git push` from an agent's non-interactive shell has hung here before,
apparently because Git Credential Manager wanted to do an interactive
device-login flow and had nothing to prompt against. It resolved itself on
a later attempt without any local config change (credential likely got
refreshed/cached from an interactive login elsewhere in the meantime). If
`git push` hangs: don't fight it with GCM env vars, just retry later, or
ask the user to run it themselves (they can do so live via the `!`-prefixed
command passthrough in Claude Code).

## Things NOT to do

- Don't hand-edit `bin/plugin.mjs` — it's regenerated and your edit will
  silently vanish on the next `npm run build`.
- Don't commit `usage-cache.json` or anything under `local-assets/` (both
  gitignored on purpose — cache is machine-local runtime state, the logo is
  a personal-use asset not licensed for redistribution in this OSS repo).
- Don't assume transcript line count == message count. See dedup section above.
