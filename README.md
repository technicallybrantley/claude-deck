# Claude Deck — Stream Deck plugin

Live Claude usage gauges, running Claude Code sessions, and quick-launch keys for the Elgato Stream Deck (Windows).

The usage gauges show the **same session/weekly percentages Claude Desktop and Claude Code's `/usage` display** — pulled with your local Claude sign-in, refreshed every couple of minutes. No extra login, nothing leaves your machine.

![Claude Deck — live usage, sessions, and launchers on a Stream Deck XL](docs/shot1.png)

## Keys

| Key | What it shows / does |
|---|---|
| **Session 5h** | Live 5-hour limit % ring + reset countdown. Press to refresh. |
| **Weekly** | Weekly limit % ring + per-model weekly % underneath. |
| **Today** | Today's Claude Code activity: chats, messages, tokens. |
| **Sessions** | Count of running Claude Code sessions and how many are busy (5s refresh). Press to cycle per-session details. Background Agent SDK sessions aren't windows you can switch to, so they're reported separately as `+N sdk` rather than counted. |
| **Launch Claude Desktop** | Opens the Claude Desktop app (Microsoft Store install auto-detected). |
| **Quick Chat** | Fires Claude's global quick-chat hotkey (Ctrl+Alt+Space). |
| **Open claude.ai** | New chat in your browser. |
| **Claude Code Terminal** | Opens a terminal running `claude` in `Documents\GitHub` (falls back to your home folder). |
| **Model Usage (weekly)** | Per-model weekly limit % (e.g. your Fable allowance). |
| **Burn Rate** | Tokens/hour over the last hour + estimated time until the 5h session cap ("cap in ~1h 20m" / "steady"). |
| **Project Terminal** | Configurable: opens Claude Code in a specific project folder (label + path in key settings). |
| **Focus Session** | Press to cycle running sessions and bring each one's terminal window to the front. |
| **Quick Prompt** | Configurable: opens quick chat and pastes a canned prompt (optionally presses Enter). Overwrites the clipboard. |
| **Claude Custom** | A Claude-styled spare key that opens anything you set: app, URL, or folder. |
| **7-Day Chart** | Press to turn the *whole deck* into a 7-day block chart of your Claude Code activity. Stream Deck XL only. |
| **Activity Rain** | Token rain falling across a block of keys while Claude Code is working. |
| **Terminal Tail** | A live CLI tail of session and token events, with a blinking cursor. |
| **Game of Life** | Conway's Life in Claude orange; every request seeds a new glider. |
| **Burn History** | Retro system-monitor graph of token burn over the last several minutes. |
| **Pipes** | The screensaver, in blocks. Pipe count tracks how many sessions are working. |

Bar colors: green < 60%, amber 60–85%, red ≥ 85%. At 90%+ the gauge pulses red.
The sessions key shows an animated dot cycle while any session is actively working.

### The 7-day chart

Pressing **7-Day Chart** switches the deck to a bundled profile where all 32 keys
become one chart: seven day-columns of stacked blocks (oldest on the left, today
highlighted), and a side column with the 7-day total, the peak day, the daily
average, and a **BACK** key. Back returns to whatever profile and page you were
on when you pressed it.

- Press any day column to switch the whole chart between **tokens** and **messages**.
- Press any side-panel stat to re-read the transcripts.
- A bar is one continuous column drawn across four keys, so it has full pixel
  resolution — not four steps.

The chart reads the same local transcripts as the **Today** key, so it counts
Claude Code activity **on this machine only** — expect it to sit below the
account-wide gauges if you also use Claude Desktop, claude.ai, or another
computer.

### Animated tiles

Five keys — **Activity Rain**, **Terminal Tail**, **Game of Life**, **Burn
History** and **Pipes** — aren't really single keys. Drop several copies of one
of them next to each other (a 3x4 block works well) and they stop being separate
keys: the plugin takes their bounding box as one canvas and each key draws its
slice of a single animation. Put a block anywhere, in any rectangle; nothing is
hardcoded, so moving or resizing it needs no configuration, and a lone key just
renders the whole thing by itself.

They're driven by real telemetry rather than a loop:

| Tile | What the motion means |
|---|---|
| **Activity Rain** | Fall speed = burn rate; number of running lanes = sessions working. |
| **Terminal Tail** | Sessions opening, closing and flipping busy/idle, plus per-project token totals as they land. Text is quantized to the key grid so no character or line is ever cut in half by the gap between keys. |
| **Game of Life** | A real Conway simulation with wrapped edges. Each request drops a glider in; a board that dies out or stalls reseeds itself. |
| **Burn History** | Tokens per 30s bucket over the last ~13 minutes, newest column on the right. Actual history, which the gauges don't give you. |
| **Pipes** | One pipe per working session, up to four. Fills the block, then wipes and starts over. |

**At rest** the animated ones stop entirely — Rain, Life and Pipes freeze on a
final calm frame and the plugin stops pushing images until work resumes; Terminal
and History slow down but keep the cursor blinking and the graph scrolling.
Press any key in a block to pause it by hand.

| Limits at a glance | Agents at a glance |
|---|---|
| ![Session gauge pulsing red at 94%, burn rate, weekly gauge](docs/shot2.png) | ![Session count with activity dots, focus key, today's stats](docs/shot3.png) |

## Requirements

- Windows, Stream Deck software 6.5+ (Node.js plugin runtime)
- [Claude Code](https://claude.com/claude-code) signed in (provides `~/.claude/.credentials.json`, session and activity data)
- Claude Desktop (optional, for the launcher/quick-chat keys)

## Install

1. Download/clone this repo.
2. Close the Stream Deck app.
3. Copy `com.technicallybrantley.claude-deck.sdPlugin` into `%APPDATA%\Elgato\StreamDeck\Plugins\`.
4. Start the Stream Deck app — the actions appear under the **Claude Deck** category.
5. Optional: double-click `Claude.streamDeckProfile` to import a ready-made Stream Deck XL profile.

## Build from source

```powershell
npm install
npm run build      # regenerates the bundled profile, then bundles src/plugin.js -> bin/plugin.mjs
npm run selftest   # exercises the usage endpoint + local data without Stream Deck
npm run preview -- --out chart.svg [--metric msgs]   # renders the 7-day chart to one SVG
```

The plugin speaks the Stream Deck WebSocket protocol directly — the only runtime dependency is `ws`. Debug log: `claude-deck.log` inside the installed plugin folder.

## How usage data works

- **Limits**: `GET https://api.anthropic.com/api/oauth/usage` authorized with the OAuth token Claude Code keeps in `~/.claude/.credentials.json`. This is the same source the `/usage` command uses. It is not a publicly documented API, so it may change; the plugin logs the raw response shape to make fixes easy.
- **Sessions**: `~/.claude/sessions/*.json`, filtered to live processes.
- **Today / 7-Day Chart**: parsed from `~/.claude/projects/**/*.jsonl` transcripts (Claude Code activity only — desktop chats don't write local logs, though they do count toward the limit gauges). The usage endpoint only reports *current* utilization, so any history has to come from these local files.

## Notes

- Not affiliated with or endorsed by Anthropic. The spark icons are original artwork drawn in a similar spirit; official Anthropic/Claude logos are trademarks and are not included.
- Usage percentages are account-wide, so desktop app, claude.ai, and Claude Code usage all show up in the gauges.

## License

MIT
