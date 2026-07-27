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
client backs off 240s), not a bug.

That backoff has a sharp edge worth knowing: **blank usage gauges right after a
deploy usually aren't a code bug.** `usage-cache.json` (the warm-start reading)
lives inside the installed folder, so a wipe-and-copy deploy used to delete it;
if the first poll after the restart then 429'd, session/weekly/model sat on `--`
for the whole backoff while the local keys kept working. `deploy.ps1` now carries
that file across. Before debugging "the gauges broke", check `claude-deck.log`
for a 429 and compare the cache timestamp — if a later poll wrote a good reading,
it fixed itself. Rasterize a preview with
`chrome --headless --screenshot=out.png --window-size=1208,620 file:///...`.

## Blank gauges after a *reboot* are the auth gap (fixed, don't reintroduce)

Different failure from the deploy one above, same symptom. **Claude Code owns the
OAuth refresh; this plugin only reads `~/.claude/.credentials.json`.** After the
machine has been off, the stored `accessToken` is already expired, and it stays
expired until Claude Code next launches — six minutes, in the case that prompted
this. The old code sent the dead token anyway at the normal 90s rate, and the
resulting run of 401s earned a **429 whose backoff escalated to the 15-minute
cap**, so the gauges stayed blank long after the token was fine.

Three invariants now hold, and all three matter:

- **Never send a token known to be dead.** `readToken()` returns `{token,
  expired}` from `expiresAt`, and `authDeadToken` remembers the exact token that
  401'd. Both short-circuit before `fetch`, so at most *one* request is spent per
  token rotation and no amount of waiting can earn a 429.
- **`authWait` is separate state from `usageBackoff`.** An auth retry costs a
  file read, not a request, so it polls at 15s and takes precedence — an auth
  wait must never inherit a leftover 429 interval. Conversely `usageBackoff` is
  cleared on any non-429 response, or one unrelated error pins the poller at
  900s.
- **A stale reading beats `--`.** The cache TTL is 12h (it exists to survive an
  overnight reboot; the old 30 minutes rejected it exactly then), and
  `usageStale()` labels anything over 4 minutes as "8m old" / "14h old" so a
  cached number can't pass for live.

Also: the no-reading sub-label is "auth refreshing…", **not "sign in?"**. The
user is signed in; telling them otherwise sends them chasing a problem that
resolves itself. `npm run selftest` exercises all of this headlessly.

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

## Multi-key canvases: two different mechanisms

Both the 7-day chart and Activity Rain draw one image across many keys, but they
get their geometry from opposite directions — don't copy the wrong one.

- **Chart** — fixed 8x4 positions inside a *bundled profile*, because it has to
  own keys the user never placed. Coordinates are known up front.
- **Rain** — no profile at all. The user drops N copies of one action wherever
  they like; `renderRain()` takes the **bounding box of the live `willAppear`
  coordinates** as the canvas, grouped by device. Any rectangle works, moving it
  needs no config, and a lone key renders the whole animation by itself.

Anything that only adds keys to the user's own profile should use the bounding-box
approach — a bundled profile is only worth it when you must take over the deck.

Shared trick: render in whole-canvas coordinates, translate by `-col*144, -row*144`
per key, let the viewBox clip. Cull off-key geometry before emitting it or each
key's SVG carries the entire canvas.

All five tiles (`TILE_KINDS`) share one frame pump. Per-kind rate and idle
behavior live in `TILE_SPEC`: `idleMs: 0` means freeze — push one final calm
frame, then stop sending until work resumes. Keep that guard; 12 keys of
`setImage` at speed is real load on the Stream Deck app. `tileCell()` and
`tileStep()` are the only per-kind switches, so `--preview` and the live
renderer can't drift apart.

Per-tile things that will bite:

- **Rain** — lane speed and phase come from a `Math.sin` hash of the lane index,
  **not** `Math.random()`; lanes must be identical frame to frame. One stream per
  lane leaves whole keys empty, hence two staggered streams above a threshold.
- **Terminal** — text is quantized to the key grid in *both* axes (whole
  characters per key, whole lines per key row). Without that, glyphs and line
  boxes get sliced in half by the physical gap and it looks broken. If you change
  the font or size, recheck `CW ≈ 0.55em` for Consolas.
- **Life / Pipes** — carry simulation state, so they step once per *frame*, not
  once per key. State lives in `sims`, keyed by kind+device+size, which is also
  what makes two differently-sized blocks work independently.
- **History** — reads `hourTracker` events directly rather than the once-a-minute
  `tokensHour` sample, which is the only way to get sub-minute resolution.
- **Scuttle** — a critter that walks the block. Sprites are a character grid
  (`#` full cell, `=` lower half — the dark top edge reads as an eye — `(` / `)`
  quarter cells), held as **data in `SPRITE_DEFAULT`, not drawing code**, so
  `sprite.json` in the installed folder can replace it at load time. That's the
  point: the shipped art is original, and anyone wanting a mascot they hold a
  licence for drops it in `local-assets/sprite.json` for `deploy.ps1` to copy
  across. **Don't inline third-party artwork here** — the README promises the
  repo contains none, and that promise is the reason this indirection exists.
  Three things will bite. At 11 cells it's 132px wide in a 144px key, so any
  off-centre position slices it into what looks like two animals — hence
  `SPR_DWELL`, which parks it on key centres and darts it across the gap. Every
  sprite origin is `Math.round`ed, because neighbouring cells share an edge and
  fractional coordinates get both sides antialiased, drawing a hairline grid
  through the creature.

  And the invariant that's easy to break: **it may cross a gap but must never
  come to rest in one.** `idleMs: 0` freezes the tile wherever it stands, and
  that frozen frame is what you then look at for minutes — so a mid-dart freeze
  doesn't read as "crossing", it reads as living in the gap. `scuttleCellKey`
  snaps `sim.p` to the nearest key (and drops any act, or it sleeps mid-hop) the
  moment `busy` hits zero. Anything that changes when the tile stops animating
  has to keep that snap.

  Its idle business (`ACT_LEN` / `sprActArt`) only ever starts while parked, and
  holds it still until done. Props go in the **headroom above** and in a
  contrasting colour — there's no room beside a 132px creature in a 144px key,
  and a body-coloured prop just reads as part of it. `--act <name>` forces one
  for previewing, since they otherwise fire at random.

`--preview` advances each tile by *its own* `TILE_SPEC.ms`, not a fixed step
count. Don't "simplify" that back: a fixed count animates something the deck
never runs, and where a tile has a dwell it lands on the same phase every frame
and misreports how often the tile looks wrong. `--frames N` renders a longer
strip, which is the only way to judge an animation that's only occasionally bad.

## Not every `~/.claude/sessions/*.json` is a session the user can see

`pidAlive()` is necessary but not sufficient. Each file carries an
`entrypoint` naming who started it:

- `cli` — a terminal the user opened. Has `status` / `updatedAt`.
- `claude-desktop` — launched from the desktop app. No `status`.
- `sdk-ts` (and siblings) — spawned programmatically by an Agent SDK harness.
  No `status`, no window, and one node orchestrator can hold a dozen at once.

All of them are live processes, so a naive count reads far higher than what the
user sees — 17 vs ~6 here, because 8 were SDK agents under three node parents.
`pollSessions()` deny-lists `entrypoint.startsWith("sdk")` (deny-list, so an
unfamiliar user-facing entrypoint still counts) and reports those separately as
`state.agents`. `kind` is *not* the discriminator — it's `"interactive"` on SDK
sessions too.

Unrelated red herring while diagnosing this: many of those processes run from a
binary named `claude.exe.old.<timestamp>`, which is just Claude Code having
self-updated underneath them. It says nothing about session validity.

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
  profile updates the installed one instead of appearing twice. It also embeds
  `manifest.Version`, so **bumping the version rewrites the profile too** — that
  churn in the diff is expected, not the generator being non-deterministic.

## Usage poll rate is adaptive, and the reset is laggy on the server side

`nextUsageDelay()` picks the interval from the current reading: 90s normally,
45s past 75%, 20s past 95%, 15s from two minutes before a rollover until five
minutes after. A flat interval was wrong in both directions — too slow to track
the number when it matters, and it left a stale 100% on screen after the window
had already reopened.

The thing worth knowing: **`resets_at` passing does not mean the server has
rolled the window.** It can keep reporting the old utilization for a while
afterwards, which is why the fast band extends *past* the reset instead of
stopping at it, and why it's bounded (five minutes) so a stale `resets_at` can't
pin the poller at 15s indefinitely. `scheduleResetPoll()` still fires a one-shot
poll at reset + 8s on top of this.

429 backoff is now separate state (`usageBackoff`) from the adaptive rate, so a
throttle can't be mistaken for a normal interval and vice versa. Every successful
poll logs `usage: 5h=..% wk=..% next=..s` — check that first when the number
looks stale.

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
