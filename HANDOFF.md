# Handoff notes for future agents

The README is the user-facing doc; this is the "what you'd otherwise have to
rediscover" doc. Keep it short — add things you learned the hard way, not
narration.

## Repo shape

- `src/plugin.js` — the source. Edit this, never the bundle.
- `com.technicallybrantley.claude-deck.sdPlugin/bin/plugin.mjs` — esbuild output,
  checked in because Stream Deck loads from the installed plugin folder.
  Regenerate with `npm run build`; hand-edits vanish on the next build.
- `manifest.json` — action definitions. Bump `"Version"` (4-part) on any
  behavior change so cached state isn't confused with new.
- `tools/make-chart-profile.mjs` — generates the bundled
  `Claude 7-Day Chart.streamDeckProfile`. Runs as part of `npm run build`.
- `deploy.ps1` — stop Stream Deck, replace the installed plugin folder, restart.
  Windows-only; run it with the `PowerShell` tool, not `Bash`.
- `local-assets/claude-logo.png` is gitignored (personal-use icon override);
  `deploy.ps1` copies it over the SVG launcher/category icons if present.

## Build → verify → deploy

```powershell
npm run build      # regenerates the bundled profile, then src/plugin.js -> bin/plugin.mjs
npm run selftest   # runs every poller headless and prints results — no deck needed
npm run preview -- --out chart.svg [--metric msgs]   # renders all 32 chart keys to one SVG
.\deploy.ps1       # installs to %APPDATA%\Elgato\...\Plugins\, restarts Stream Deck
```

Run `selftest` before deploying — it catches logic errors without a restart
cycle. A 429 from the usage endpoint there is expected if you just hit it (the
client backs off 240s), not a bug. Rasterize a preview with
`chrome --headless --screenshot=out.png --window-size=1208,620 file:///...`.

Runtime log: `%APPDATA%\Elgato\StreamDeck\Plugins\<plugin>\claude-deck.log`.
Stream Deck's own log: `%APPDATA%\Elgato\StreamDeck\logs\StreamDeck.log`.

## The transcript-line dedup gotcha (commit `ea27c2c`)

The thing most likely to bite you if you touch `pollToday()` / `pollBurn()` /
`pollWeek()`, or add any poller reading `~/.claude/projects/**/*.jsonl`:

**One assistant turn writes multiple lines, and every line repeats that
request's full cumulative `usage` object** — not a per-block increment. A
response with a thinking block + 6 tool calls writes 7 lines carrying identical
`output_tokens` / `cache_read_input_tokens`, all sharing one `requestId`.
Summing across lines overcounted by ~2.5x on a real day.

**Invariant to preserve:** dedupe by `message.id` (fall back to `j.requestId`)
and take the **max** usage per id, never the sum.

- `pollToday()` — a `reqTok` Map per file.
- `pollBurn()` — a `rec.seen` Map beside its event list, because it's an
  incremental tail-reader: a later snapshot of the same request revises the
  totals, so it updates the existing event in place instead of pushing a new one.
- `pollWeek()` — keys the max by id *and* the day the id first appeared, so one
  request can't land in two columns.

Cross-check when changing any of this: the chart's "today" column and the Today
key are computed independently and must agree exactly.

## The whole-deck 7-day chart (profile takeover)

A plugin can only draw on keys holding its own actions, so taking over the deck
means switching to a profile bundled in the `.sdPlugin` folder.

- **`switchToProfile`'s `context` is the *plugin* UUID** (`-pluginUUID` argv),
  not the pressed key's context. The key context fails silently.
- **Omitting `profile` from the payload is the back button** — Stream Deck
  restores the previous profile *and page* itself. No bookkeeping needed.
- **Bundled profiles install lazily.** Nothing lands in `ProfilesV3` at plugin
  load; import happens on first use and logs
  `ESDProfileOperationImportFromPlugin::importProfile`. Grep that before
  suspecting the profile file.
- **Ignore `Failed to find last selected page ... for umbrella ...` on import.**
  Stream Deck rewrites every GUID as it imports and warns against the old id.
  The installed copy resolves correctly — check it before "fixing" anything.
- **A profile is bound to one `DeviceType`** (2 = XL) and the chart geometry
  assumes 8x4; a 15-key deck needs a second profile *and* a second layout.
  Stream Deck clones the profile per physical device and re-stamps
  `Device.Model` itself, so the hardcoded `20GAT9901` is fine — don't add
  per-device logic. `chart-open` alerts instead of switching on a non-XL deck.
- **`VisibleInActionsList: false`** keeps `chart-cell` out of the user's action
  list. Real property, not in every published version of the schema.
- The profile is **32 identical `chart-cell` instances with empty Settings**;
  each key derives what to draw from `payload.coordinates`. Don't bake positions
  into the profile — that's two places to keep in sync instead of one.
- Cells are drawn in **whole-column coordinates** (144x576), each key rendering
  the full column translated by `-row*144` and letting the viewBox clip. That's
  what makes a bar continuous across four keys instead of four stair steps.
- The generator writes a **stored zip with fixed timestamps and GUIDs**, so
  rebuilds are byte-identical unless the layout changed and a regenerated
  profile updates the installed one instead of appearing twice.

## Two different data sources — don't reconcile them

- Session/Weekly/Model gauges hit `GET https://api.anthropic.com/api/oauth/usage`
  (undocumented, OAuth token from `~/.claude/.credentials.json`) — server-computed
  truth, the same numbers `/usage` shows. Trust it over anything local. It reports
  only *current* utilization, so any history must come from transcripts.
- Today / Burn Rate / 7-Day Chart are local-only, so they see Claude Code on
  **this machine** and undercount relative to the account-wide gauges. That gap
  is real and directional — don't "fix" it by inflating the local numbers.

## Things NOT to do

- Don't hand-edit `bin/plugin.mjs`.
- Don't commit `usage-cache.json` or anything under `local-assets/` (gitignored
  on purpose — machine-local state, and a personal-use asset not licensed for
  redistribution here).
- Don't assume transcript line count == message count. See the dedup section.
