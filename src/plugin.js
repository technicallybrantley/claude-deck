// Claude Deck — Stream Deck plugin
// Shows live Claude subscription usage (same numbers as Claude Desktop / /usage),
// running Claude Code sessions, and quick-launch keys.
import { WebSocket } from "ws";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let PLUGIN_VERSION = "";
try { PLUGIN_VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8")).Version ?? ""; } catch {}

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CREDS_FILE = path.join(CLAUDE_DIR, ".credentials.json");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const STATS_CACHE = path.join(CLAUDE_DIR, "stats-cache.json");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const githubDir = path.join(os.homedir(), "Documents", "GitHub");
const DEFAULT_CODE_DIR = fs.existsSync(githubDir) ? githubDir : os.homedir();

// Claude Desktop (Microsoft Store) — resolved from the Start menu at startup so any install works
let desktopAppId = "shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude";
execFile("powershell.exe", ["-NoProfile", "-Command",
  "Get-StartApps | Where-Object {$_.Name -eq 'Claude'} | Select-Object -First 1 -ExpandProperty AppID"],
  (err, out) => { const id = out?.trim(); if (!err && id) desktopAppId = "shell:AppsFolder\\" + id; });

// ---------- logging ----------
const LOG_FILE = path.join(process.cwd(), "claude-deck.log");
function log(...args) {
  const line = `${new Date().toISOString()} ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

// ---------- theme ----------
const C = {
  bg: "#16151c",
  panel: "#211f2b",
  text: "#f5f1ea",
  dim: "#9b96a8",
  accent: "#d97757", // Claude orange
  accentHi: "#f0a184", // lighter accent — marks "today" in the 7-day chart
  ok: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
  track: "#3a3745",
};
const pctColor = (p) => (p == null ? C.dim : p >= 85 ? C.bad : p >= 60 ? C.warn : C.ok);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Claude-style spark (12 tapered rays), baked centered at (120,24), ~30px wide
const SPARK_PATH = "M121.79 21.82 L120.60 9.01 L118.39 21.68 Z M122.56 22.82 L125.12 14.49 L119.57 21.21 Z M122.81 24.26 L131.48 16.90 L121.02 21.37 Z M122.18 25.79 L130.19 24.41 L122.32 22.39 Z M121.18 26.56 L132.55 30.75 L122.79 23.57 Z M119.74 26.81 L125.52 32.93 L122.63 25.02 Z M118.21 26.18 L119.40 38.99 L121.61 26.32 Z M117.44 25.18 L115.03 33.25 L120.43 26.79 Z M117.19 23.74 L108.26 31.26 L118.98 26.63 Z M117.82 22.21 L110.11 23.60 L117.68 25.61 Z M118.82 21.44 L107.58 17.32 L117.21 24.43 Z M120.26 21.19 L114.32 14.81 L117.37 22.98 Z";
const sparkAt = (x, y, color = C.accent, opacity = 1, scale = 1) =>
  `<g transform="translate(${x} ${y}) scale(${scale}) translate(-120 -24)"><path d="${SPARK_PATH}" fill="${color}" stroke="${color}" stroke-width="0.8" stroke-linejoin="round" opacity="${opacity}"/></g>`;

// ---------- svg key renderers (144x144) ----------
// Faint watermark behind data keys: the real Claude logo when deploy.ps1 supplied
// one (local-assets), otherwise the drawn spark so the OSS build still gets texture.
let WATERMARK;
try {
  const b64 = fs.readFileSync(path.join(PLUGIN_DIR, "imgs", "launch.png")).toString("base64");
  WATERMARK = `<image xlink:href="data:image/png;base64,${b64}" href="data:image/png;base64,${b64}" x="24" y="24" width="96" height="96" opacity="0.12"/>`;
} catch {
  WATERMARK = sparkAt(72, 76, C.accent, 0.08, 2.4);
}

// mark=false for the chart cells — 28 watermarks tiled across the deck is noise,
// and anything drawn outside the 144x144 viewBox is clipped, which is what lets a
// bar be drawn in whole-column coordinates and sliced by each key.
function svgWrap(inner, mark = true) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" rx="18" fill="${C.bg}"/>${mark ? WATERMARK : ""}${inner}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function gaugeKey(label, pct, sub, pulsePhase = null) {
  const has = typeof pct === "number" && isFinite(pct);
  const p = has ? Math.max(0, Math.min(100, pct)) : 0;
  const col = has ? pctColor(p) : C.dim;
  const pulse = pulsePhase == null ? "" :
    `<rect x="4" y="4" width="136" height="136" rx="16" fill="none" stroke="${C.bad}" stroke-width="6" opacity="${[0.2, 0.55, 0.95][pulsePhase % 3]}"/>`;
  return svgWrap(`
    ${pulse}
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(label)}</text>
    <text x="72" y="78" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${has ? 46 : 34}" font-weight="700" fill="${has ? col : C.dim}">${has ? Math.round(p) + "%" : "--"}</text>
    <rect x="14" y="90" width="116" height="12" rx="6" fill="${C.track}"/>
    ${has ? `<rect x="14" y="90" width="${Math.max(8, (116 * p) / 100)}" height="12" rx="6" fill="${col}"/>` : ""}
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

// Shown instead of the gauge once a window is maxed: a CRT-style countdown to
// the reset, since "100%" on its own tells you nothing you can act on. windowMs
// is the length of the limit window, used for the progress segments.
const CAP_5H = 5 * 3.6e6, CAP_7D = 7 * 864e5;
function capKey(label, resetsAt, windowMs, phase) {
  const now = Date.now();
  const ms = new Date(resetsAt).getTime() - now;
  const p2 = (n) => String(n).padStart(2, "0");
  const live = ms > 0;
  const d = Math.floor(ms / 864e5);
  const hOfDay = Math.floor((ms % 864e5) / 3.6e6);
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
  // Colons stay lit: the key only redraws every 600ms, so a 1Hz blink aliases
  // into an irregular stutter. The pulsing border carries the motion instead.
  // Weekly caps can be days out, where ticking seconds are just noise.
  const clock = !live ? "--:--"
    : d >= 1 ? `${d}d ${p2(hOfDay)}:${p2(m)}`
    : h > 0 ? `${h}:${p2(m)}:${p2(s)}`
    : `${p2(m)}:${p2(s)}`;
  const size = Math.min(46, Math.floor(124 / (clock.length * 0.55)));  // mono advance ≈ 0.55em
  const done = live ? Math.max(0, Math.min(1, 1 - ms / windowMs)) : 1;
  const segs = 11, lit = Math.round(segs * done);
  const bar = Array.from({ length: segs }, (_, i) =>
    `<rect x="${13 + i * 11.6}" y="119" width="8" height="10" rx="2" fill="${i < lit ? C.accent : C.track}" opacity="${i < lit ? 1 : 0.35}"/>`).join("");
  // faint CRT scanlines
  let scan = "";
  for (let y = 10; y < 138; y += 6) scan += `<rect x="6" y="${y}" width="132" height="1" fill="${C.text}" opacity="0.045"/>`;
  const at = !live ? "any moment"
    : ms >= 864e5 ? new Date(resetsAt).toLocaleString([], { weekday: "short", hour: "numeric" }).replace(",", "")
    : new Date(resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return svgWrap(`
    ${scan}
    <rect x="5" y="5" width="134" height="134" rx="12" fill="none" stroke="${C.bad}" stroke-width="3" opacity="${[0.35, 0.7, 1][phase % 3]}"/>
    <text x="72" y="33" text-anchor="middle" font-family="${MONO}" font-size="15" font-weight="700" letter-spacing="1.5" fill="${C.bad}">${esc(label)}</text>
    <text x="72" y="83" text-anchor="middle" font-family="${MONO}" font-size="${size}" font-weight="700" fill="${C.accentHi}" xml:space="preserve">${clock}</text>
    <text x="72" y="107" text-anchor="middle" font-family="${MONO}" font-size="14" fill="${C.dim}">${live ? "resets " + esc(at) : "resetting"}</text>
    ${bar}`, false);
}

function linesKey(title, rows, accent = C.accent) {
  const rowSvg = rows
    .map((r, i) => {
      const y = 62 + i * 31;
      return `<text x="14" y="${y}" font-family="Segoe UI, sans-serif" font-size="${r.big ? 28 : 20}" font-weight="${r.big ? 700 : 600}" fill="${r.color ?? C.text}">${esc(r.text)}</text>`;
    })
    .join("");
  return svgWrap(`
    <rect x="0" y="0" width="144" height="34" rx="18" fill="${C.panel}"/>
    <rect x="0" y="17" width="144" height="17" fill="${C.panel}"/>
    <text x="14" y="24" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${rowSvg}`);
}

function bigCountKey(title, count, sub, subColor, animPhase = null, subSize = 17) {
  // animPhase non-null → cycling activity dots beside the count (frame-pushed animation)
  const dots = animPhase == null ? "" : [0, 1, 2]
    .map((i) => `<circle cx="122" cy="${56 + i * 16}" r="${i === animPhase ? 4.5 : 3}" fill="${i === animPhase ? C.ok : C.track}"/>`)
    .join("");
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    ${dots}
    <text x="72" y="96" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="64" font-weight="700" fill="${count > 0 ? C.text : C.dim}">${count}</text>
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${subSize}" fill="${subColor ?? C.dim}">${esc(sub ?? "")}</text>`);
}

function burnKey(tokensHour, sub) {
  const has = tokensHour != null;
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">BURN RATE</text>
    <text x="72" y="82" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="40" font-weight="700" fill="${has ? C.accent : C.dim}">${has ? fmtNum(tokensHour) : "--"}</text>
    <text x="72" y="104" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">tok/hr</text>
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

// Generic key for configurable actions: header + big wrapped label + footer
function labelKey(title, label, sub, accent = C.accent) {
  const text = String(label ?? "").trim() || "—";
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= 11) cur = (cur + " " + w).trim();
    else { lines.push(cur); cur = w; if (lines.length === 2) break; }
  }
  if (cur && lines.length < 2) lines.push(cur);
  const lineSvg = lines.slice(0, 2)
    .map((l, i) => `<text x="72" y="${lines.length > 1 ? 68 + i * 27 : 82}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="22" font-weight="700" fill="${C.text}">${esc(l.slice(0, 12))}</text>`)
    .join("");
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${lineSvg}
    <text x="72" y="128" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
}

// ---------- 7-day block chart (takes over a whole Stream Deck XL) ----------
// Geometry is in whole-column pixels: the deck is 8x4 keys of 144px, so a day
// column is one 144x576 canvas that gets sliced into four key images. Each key
// draws the entire column translated by -row*144 and lets the viewBox clip.
const CHART_COLS = 8, CHART_ROWS = 4, KEY = 144;
const CHART_DAYS = 7;            // columns 0..6 are days, column 7 is the side panel
const LABEL_H = 40;              // bottom strip of the last row: weekday + value
const AXIS_Y = CHART_ROWS * KEY - LABEL_H;   // 536 — baseline of every bar
const BLOCK_H = 20, BLOCK_GAP = 4, BLOCKS = 21;  // 21 blocks ≈ 500px of stack

const dayVal = (d, metric) => (metric === "msgs" ? d?.msgs : d?.tokens) ?? 0;

function barCellKey(d, row, max, metric) {
  const v = dayVal(d, metric);
  const frac = max > 0 ? Math.min(1, v / max) : 0;
  const filled = frac * BLOCKS;
  const full = Math.floor(filled);
  const part = filled - full;
  const col = d.isToday ? C.accentHi : C.accent;
  let out = "";
  for (let i = 0; i < BLOCKS; i++) {
    const y = AXIS_Y - i * (BLOCK_H + BLOCK_GAP) - BLOCK_H - row * KEY;
    if (y > KEY || y + BLOCK_H < 0) continue; // this block isn't on this key
    let fill = C.track, op = 0.32;
    if (i < full) { fill = col; op = 1; }
    else if (i === full && part > 0.03) { fill = col; op = 0.45 + 0.55 * part; }
    out += `<rect x="26" y="${y}" width="92" height="${BLOCK_H}" rx="5" fill="${fill}" opacity="${op}"/>`;
  }
  if (row === CHART_ROWS - 1) {
    const a = AXIS_Y - row * KEY;
    out += `<rect x="14" y="${a}" width="116" height="2" rx="1" fill="${d.isToday ? col : C.track}"/>
      <text x="72" y="${a + 20}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="15" font-weight="600" letter-spacing="0.5" fill="${d.isToday ? col : C.dim}">${esc(d.label)}</text>
      <text x="72" y="${a + 37}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700" fill="${C.text}">${fmtNum(v)}</text>`;
  }
  return svgWrap(out, false);
}

function chartStatKey(title, value, sub, color = C.accent) {
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="16" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    <text x="72" y="88" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="36" font-weight="700" fill="${color}">${esc(value)}</text>
    <text x="72" y="122" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`, false);
}

function backCellKey() {
  return svgWrap(`
    <path d="M86 34 L54 68 L86 102" fill="none" stroke="${C.accent}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="72" y="130" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" font-weight="700" letter-spacing="1" fill="${C.text}">BACK</text>`, false);
}

// The launcher key on the normal profile: a miniature of the same chart
function chartOpenKey(days, metric) {
  const vals = days.map((d) => dayVal(d, metric));
  const max = Math.max(...vals, 1);
  const bars = days.length
    ? days.map((d, i) => {
        const h = Math.max(4, Math.round(62 * (dayVal(d, metric) / max)));
        return `<rect x="${13 + i * 17}" y="${102 - h}" width="13" height="${h}" rx="3" fill="${d.isToday ? C.accentHi : C.accent}" opacity="${d.isToday ? 1 : 0.75}"/>`;
      }).join("")
    : `<text x="72" y="84" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="20" fill="${C.dim}">--</text>`;
  const total = vals.reduce((a, b) => a + b, 0);
  return svgWrap(`
    <text x="14" y="27" font-family="Segoe UI, sans-serif" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">7 DAYS</text>
    ${bars}
    <rect x="13" y="103" width="119" height="2" rx="1" fill="${C.track}"/>
    <text x="72" y="130" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700" fill="${C.text}">${fmtNum(total)}${metric === "msgs" ? " msgs" : " tok"}</text>`);
}

// ---------- activity rain (spans however many keys you drop it on) ----------
// Same whole-canvas-sliced-per-key idea as the chart, but the block's origin and
// size come from the bounding box of wherever the user placed the keys, so any
// rectangle works and it can be moved without touching code.
const RAIN_STEP = 22, RAIN_BH = 16, RAIN_TRAIL = 8, RAIN_LANE_W = 36;

// Deterministic per-lane jitter. Lanes must keep the same speed and phase from
// frame to frame, so this can't be Math.random() — it's hashed off the lane index.
const fracOf = (n) => n - Math.floor(n);
const laneHash = (i, salt) => fracOf(Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453);

function rainCellKey(lc, lr, cols, rows, t, busy, burn) {
  const W = cols * KEY, H = rows * KEY;
  const lanes = Math.max(1, Math.round(W / RAIN_LANE_W));
  const laneW = W / lanes;
  const bw = Math.min(28, Math.max(10, laneW - 12));
  const ox = lc * KEY, oy = lr * KEY;
  const trailLen = RAIN_TRAIL * RAIN_STEP;
  // Both knobs are real telemetry: how fast it falls is the burn rate, how many
  // lanes run is how many sessions are working.
  const speed = 55 + Math.min(150, (burn ?? 0) / 400_000);
  const density = busy > 0 ? Math.min(1, 0.25 + 0.18 * busy) : 0;
  // One stream per lane leaves whole keys empty at any given moment — a lane's
  // trail only covers ~a quarter of the drop. Two staggered streams keep the
  // block alive everywhere once there's more than a single session working.
  const streams = density > 0.55 ? 2 : 1;
  let out = "";
  for (let i = 0; i < lanes; i++) {
    const x = i * laneW + (laneW - bw) / 2 - ox;
    if (x > KEY + 2 || x + bw < -2) continue;   // lane isn't over this key at all
    if (laneHash(i, 3) >= density) {            // dormant lane — faint guide blocks
      for (let y = (H % RAIN_STEP) / 2; y < H; y += RAIN_STEP) {
        const ly = y - oy;
        if (ly > KEY + 2 || ly + RAIN_BH < -2) continue;
        out += `<rect x="${x.toFixed(1)}" y="${ly.toFixed(1)}" width="${bw.toFixed(1)}" height="${RAIN_BH}" rx="4" fill="${C.track}" opacity="0.13"/>`;
      }
      continue;
    }
    const sp = speed * (0.7 + 0.6 * laneHash(i, 1));
    for (let s = 0; s < streams; s++) {
      const head = fracOf(laneHash(i, 2) + s / streams + (t / 1000) * sp / (H + trailLen)) * (H + trailLen);
      for (let j = 0; j <= RAIN_TRAIL; j++) {
        const y = head - j * RAIN_STEP - oy;
        if (y > KEY + 2 || y + RAIN_BH < -2) continue;
        const fade = Math.pow(1 - j / (RAIN_TRAIL + 1), 1.4);
        out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${RAIN_BH}" rx="4" fill="${j === 0 ? C.accentHi : C.accent}" opacity="${(j === 0 ? 1 : 0.9 * fade).toFixed(2)}"/>`;
      }
    }
  }
  // At rest the whole block goes quiet, with the spark on the middle key
  if (!density && lc === Math.floor((cols - 1) / 2) && lr === Math.floor((rows - 1) / 2))
    out += sparkAt(72, 72, C.accent, 0.2, 2.2);
  return svgWrap(out, false);
}

// ---------- tile: terminal tail ----------
const MONO = "Cascadia Mono, Consolas, monospace";
const LOG_MAX = 60;
const LOG_STYLE = {
  start: { g: "+", c: C.accentHi },
  busy:  { g: ">", c: C.accent },
  idle:  { g: ".", c: C.dim },
  end:   { g: "x", c: C.dim },
  tok:   { g: "$", c: C.text },
  info:  { g: "#", c: C.dim },
};

function pushLog(kind, name, detail) {
  state.log.push({ t: Date.now(), kind, name, detail });
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
}

function termCellKey(lc, lr, cols, rows, t) {
  const LH = 25, PAD = 9, TOP = 24, FS = 17, CW = FS * 0.55; // Consolas advance ≈ 0.55em
  // Text is quantized to the key grid in both axes: each key holds a whole number
  // of characters and a whole number of lines, so nothing is ever sliced in half
  // by the physical gap between keys. Each key draws only its own slice.
  const perKey = Math.max(4, Math.floor((KEY - PAD * 2) / CW));
  const perRow = Math.max(1, Math.floor((KEY - 8 - TOP) / LH) + 1);
  const width = perKey * cols;
  const log = state.log.slice(-(perRow * rows - 3));
  const now = Date.now();
  let out = "";
  const line = (i, text, color) => {
    if (Math.floor(i / perRow) !== lr) return "";   // not on this key's row
    const slice = text.slice(lc * perKey, (lc + 1) * perKey);
    if (!slice.trim()) return "";
    return `<text x="${PAD}" y="${TOP + (i % perRow) * LH}" font-family="${MONO}" font-size="${FS}" fill="${color}" xml:space="preserve">${esc(slice)}</text>`;
  };
  out += line(0, `claude-deck v${PLUGIN_VERSION}`, C.dim);
  out += line(1, "-".repeat(width), C.track);
  log.forEach((ln, k) => {
    const st = LOG_STYLE[ln.kind] ?? LOG_STYLE.info;
    const full = `${st.g} ${String(ln.name ?? "").slice(0, 18)} ${ln.detail ?? ""}`.slice(0, width);
    // Newest line types itself in, one char at a time — the CLI tell
    out += line(2 + k, full.slice(0, Math.max(0, Math.floor((now - ln.t) / 18))), st.c);
  });
  const last = log[log.length - 1];
  const typing = last && now - last.t < 18 * width;
  out += line(2 + log.length, `claude@deck $ ${!typing && t % 1000 < 520 ? "_" : ""}`, C.accent);
  return svgWrap(out, false);
}

// ---------- tile: Conway's Life ----------
const LIFE_CELL = 24;

function lifeStep(sim, busy) {
  const { w, h } = sim;
  const next = new Uint8Array(w * h);
  let pop = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          // wrap at the edges so gliders sail off one side and back on the other
          n += sim.cur[((y + dy + h) % h) * w + ((x + dx + w) % w)];
        }
      const alive = sim.cur[y * w + x];
      const live = alive ? (n === 2 || n === 3) : n === 3;
      next[y * w + x] = live ? 1 : 0;
      if (live) pop++;
    }
  }
  sim.prev = sim.cur;
  sim.cur = next;
  // Every request drops a glider in; a board that dies out or locks up reseeds.
  if (busy > 0 && Math.random() < 0.18 * busy) lifeGlider(sim);
  sim.stale = pop === sim.pop ? sim.stale + 1 : 0;
  sim.pop = pop;
  if (pop < 6 || sim.stale > 40) lifeSeed(sim, busy);
}

function lifeGlider(sim) {
  const g = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
  const x0 = Math.floor(Math.random() * sim.w), y0 = Math.floor(Math.random() * sim.h);
  for (const [dx, dy] of g) sim.cur[((y0 + dy) % sim.h) * sim.w + ((x0 + dx) % sim.w)] = 1;
}

function lifeSeed(sim, busy) {
  const fill = 0.12 + 0.04 * Math.min(4, busy);
  for (let i = 0; i < sim.cur.length; i++) sim.cur[i] = Math.random() < fill ? 1 : 0;
  sim.stale = 0;
}

function lifeCellKey(lc, lr, cols, rows, t, sim) {
  const ox = lc * KEY, oy = lr * KEY;
  const c0 = Math.floor(ox / LIFE_CELL), c1 = Math.ceil((ox + KEY) / LIFE_CELL);
  const r0 = Math.floor(oy / LIFE_CELL), r1 = Math.ceil((oy + KEY) / LIFE_CELL);
  const s = LIFE_CELL - 4;
  let out = "";
  for (let y = r0; y < Math.min(r1, sim.h); y++) {
    for (let x = c0; x < Math.min(c1, sim.w); x++) {
      const alive = sim.cur[y * sim.w + x];
      const was = sim.prev?.[y * sim.w + x];
      if (!alive && !was) continue;
      const px = x * LIFE_CELL + 2 - ox, py = y * LIFE_CELL + 2 - oy;
      const fill = alive ? (was ? C.accent : C.accentHi) : C.accent;
      out += `<rect x="${px}" y="${py}" width="${s}" height="${s}" rx="4" fill="${fill}" opacity="${alive ? 1 : 0.18}"/>`;
    }
  }
  return svgWrap(out, false);
}

// ---------- tile: burn history (retro system monitor) ----------
// Built from the raw burn events rather than the once-a-minute tokensHour
// sample, so the graph has 30s resolution instead of 1-minute steps.
function burnSeries(buckets, bucketMs) {
  const now = Date.now();
  const out = new Array(buckets).fill(0);
  for (const rec of hourTracker.values()) {
    for (const e of rec.events) {
      const idx = buckets - 1 - Math.floor((now - e.t) / bucketMs);
      if (idx >= 0 && idx < buckets) out[idx] += e.tok;
    }
  }
  return out;
}

function historyCellKey(lc, lr, cols, rows, t, sim) {
  const W = cols * KEY, H = rows * KEY;
  const ox = lc * KEY, oy = lr * KEY;
  const PAD = 12, HEAD = 30, FOOT = 26;
  const cw = 16, gap = 3;
  const n = Math.max(4, Math.floor((W - PAD * 2) / cw));
  const vals = burnSeries(n, sim.bucketMs);
  const max = Math.max(...vals, 1);
  const top = HEAD, bottom = H - FOOT;
  const blockH = 12, blockGap = 3;
  const slots = Math.max(1, Math.floor((bottom - top) / (blockH + blockGap)));
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = PAD + i * cw - ox;
    if (x > KEY + 2 || x + cw - gap < -2) continue;
    const filled = Math.round(slots * (vals[i] / max));
    const isNow = i === n - 1;
    for (let k = 0; k < slots; k++) {
      const y = bottom - (k + 1) * (blockH + blockGap) + blockGap - oy;
      if (y > KEY + 2 || y + blockH < -2) continue;
      const on = k < filled;
      if (!on && !(k === 0)) { // keep a faint floor row so the axis reads
        out += `<rect x="${x}" y="${y}" width="${cw - gap}" height="${blockH}" rx="3" fill="${C.track}" opacity="0.12"/>`;
        continue;
      }
      out += `<rect x="${x}" y="${y}" width="${cw - gap}" height="${blockH}" rx="3" fill="${on ? (isNow ? C.accentHi : C.accent) : C.track}" opacity="${on ? 1 : 0.25}"/>`;
    }
  }
  const label = (x, y, s, col, anchor = "start", size = 15) => {
    const lx = x - ox, ly = y - oy;
    if (ly < -20 || ly > KEY + 20) return "";
    return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" font-family="${MONO}" font-size="${size}" fill="${col}">${esc(s)}</text>`;
  };
  const mins = Math.round((n * sim.bucketMs) / 60000);
  out += label(PAD, 22, `BURN ${mins}m`, C.dim);
  out += label(W - PAD, 22, `${fmtNum(state.burn?.tokensHour ?? 0)}/hr`, C.accent, "end");
  out += label(PAD, H - 8, `-${mins}m`, C.dim);
  out += label(W - PAD, H - 8, "now", C.dim, "end");
  return svgWrap(out, false);
}

// ---------- tile: retro pipes ----------
const PIPE_CELL = 24, PIPE_TINTS = ["#d97757", "#f0a184", "#b0603f"];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function pipeStep(sim, busy) {
  const want = Math.min(4, 1 + busy);
  while (sim.pipes.length < want) sim.pipes.push(newPipe(sim));
  if (sim.fade > 0) {                      // wiping: fade out, then start over
    sim.fade -= 0.06;
    if (sim.fade <= 0) { sim.pipes = []; sim.cells = 0; sim.fade = 0; }
    return;
  }
  for (const p of sim.pipes) {
    const opts = DIRS
      .map(([dx, dy]) => [p.x + dx, p.y + dy, dx, dy])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < sim.w && y < sim.h);
    if (!opts.length) { p.done = true; continue; }
    // 70% chance of carrying straight on — pipes should look like pipes, not noise
    const straight = opts.find(([, , dx, dy]) => dx === p.dx && dy === p.dy);
    const pick = straight && Math.random() < 0.7 ? straight : opts[Math.floor(Math.random() * opts.length)];
    p.x = pick[0]; p.y = pick[1]; p.dx = pick[2]; p.dy = pick[3];
    p.pts.push([p.x, p.y]);
    if (p.pts.length > 400) p.pts.shift();
    sim.cells++;
  }
  if (sim.cells > sim.w * sim.h * 0.55) sim.fade = 1;
}

function newPipe(sim) {
  const d = DIRS[Math.floor(Math.random() * DIRS.length)];
  const x = Math.floor(Math.random() * sim.w), y = Math.floor(Math.random() * sim.h);
  return { x, y, dx: d[0], dy: d[1], pts: [[x, y]], tint: PIPE_TINTS[Math.floor(Math.random() * PIPE_TINTS.length)] };
}

function pipesCellKey(lc, lr, cols, rows, t, sim) {
  const ox = lc * KEY, oy = lr * KEY;
  const half = PIPE_CELL / 2, thick = 12;
  const op = sim.fade > 0 ? Math.max(0, sim.fade) : 1;
  let out = "";
  for (const p of sim.pipes) {
    for (let i = 0; i < p.pts.length; i++) {
      const [x, y] = p.pts[i];
      const cx = x * PIPE_CELL + half - ox, cy = y * PIPE_CELL + half - oy;
      if (cx < -PIPE_CELL || cx > KEY + PIPE_CELL || cy < -PIPE_CELL || cy > KEY + PIPE_CELL) continue;
      // joint at every point, plus a bar bridging to the previous point
      out += `<rect x="${cx - thick / 2}" y="${cy - thick / 2}" width="${thick}" height="${thick}" rx="3" fill="${p.tint}" opacity="${op}"/>`;
      if (i === 0) continue;
      const [px, py] = p.pts[i - 1];
      const pcx = px * PIPE_CELL + half - ox, pcy = py * PIPE_CELL + half - oy;
      const x0 = Math.min(cx, pcx) - thick / 2, y0 = Math.min(cy, pcy) - thick / 2;
      const w = Math.abs(cx - pcx) + thick, h = Math.abs(cy - pcy) + thick;
      out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="3" fill="${p.tint}" opacity="${op}"/>`;
    }
    const head = p.pts[p.pts.length - 1];
    if (head) {
      const hx = head[0] * PIPE_CELL + half - ox, hy = head[1] * PIPE_CELL + half - oy;
      if (hx > -30 && hx < KEY + 30 && hy > -30 && hy < KEY + 30)
        out += `<rect x="${hx - 8}" y="${hy - 8}" width="16" height="16" rx="4" fill="${C.text}" opacity="${0.9 * op}"/>`;
    }
  }
  return svgWrap(out, false);
}

// ---------- formatting ----------
function fmtReset(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return "resetting…";
  const h = Math.floor(ms / 3.6e6), m = Math.round((ms % 3.6e6) / 6e4);
  if (h >= 48) return `${Math.round(h / 24)}d left`;
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}
function fmtNum(n) {
  if (n == null) return "--";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function fmtAgo(ts) {
  const ms = Date.now() - ts;
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------- data: usage (OAuth endpoint — same source as /usage & Claude Desktop) ----------
const state = {
  usage: null,        // { fiveHour, weekly, weeklyOpus } each { pct, resetsAt }
  usageErr: null,
  usageAt: 0,
  sessions: [],
  agents: 0,          // live SDK-spawned sessions — counted, but not shown as sessions
  log: [],            // recent events, tailed by the terminal tile
  today: null,
  week: null,         // { days: [{ day, label, tokens, msgs, isToday }], at }
  burn: null,
  pctHistory: [],
  loggedRaw: false,
};

// Claude Code owns the OAuth refresh — this plugin only reads what it wrote.
// `expiresAt` matters: after a reboot the stored token is usually already dead,
// and it stays dead until Claude Code next launches and refreshes it.
async function readToken() {
  const raw = await fsp.readFile(CREDS_FILE, "utf8");
  const o = JSON.parse(raw)?.claudeAiOauth;
  if (!o?.accessToken) return null;
  return {
    token: o.accessToken,
    expired: typeof o.expiresAt === "number" && o.expiresAt <= Date.now(),
  };
}

function pickBucket(o) {
  if (!o || typeof o !== "object") return null;
  let pct = null;
  // The usage endpoint reports utilization on a 0–100 scale (e.g. 13 = 13%), so
  // use it as-is. An earlier 0–1 fraction heuristic mis-scaled exactly 1% to 100%.
  if (typeof o.utilization === "number") pct = o.utilization;
  const resetsAt = o.resets_at ?? o.resetsAt ?? null;
  return pct == null && !resetsAt ? null : { pct, resetsAt };
}

const USAGE_DELAY_BASE = 90_000;
const AUTH_RETRY = 15_000;   // cheap: re-reads the credentials file, no request
let usageBackoff = 0;   // set by 429s only; overrides the adaptive rate below
let authWait = false;   // token dead — waiting on Claude Code to refresh it
let authDeadToken = null;   // the exact token that 401'd, so we don't resend it
let lastUsageAttempt = 0;
let lastUsageErrLogged = null;

// Poll rate follows how much the number is about to move. A flat 2 minutes meant
// the deck could sit a couple of percent behind the desktop app right when you
// care most, and could show a stale 100% long after the window had rolled.
function nextUsageDelay() {
  // Auth waits are not throttles: the retry costs a file read, not a request,
  // so poll briskly to pick the new token up as soon as Claude Code writes it.
  if (authWait) return AUTH_RETRY;
  if (usageBackoff) return usageBackoff;
  const b = state.usage?.fiveHour;
  const pct = b?.pct ?? 0;
  const ms = b?.resetsAt ? new Date(b.resetsAt).getTime() - Date.now() : Infinity;
  // The server can keep reporting the old window for a while after resets_at
  // passes, so keep asking until it actually flips rather than waiting a whole
  // cycle. Bounded, so a stale resets_at can't pin us at 15s forever.
  if (ms > -5 * 60_000 && ms < 2 * 60_000) return 15_000;
  if (pct >= 95) return 20_000;
  if (pct >= 75) return 45_000;
  return USAGE_DELAY_BASE;
}

// Survive restarts without re-polling. The window has to outlast a machine being
// off overnight — that is the case this cache exists for, and a 30-minute TTL
// rejected the reading exactly then, leaving the gauges on "--" through the
// post-reboot auth gap. Stale readings are shown with their age (see
// usageStale()), so an old number can't be mistaken for a live one.
const CACHE_TTL = 12 * 3.6e6;
const CACHE_FILE = path.join(PLUGIN_DIR, "usage-cache.json");
try {
  const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  if (Date.now() - c.at < CACHE_TTL) { state.usage = c.usage; state.usageAt = c.at; }
} catch {}

async function pollUsage() {
  lastUsageAttempt = Date.now();
  try {
    const cred = await readToken();
    if (!cred) throw new Error("no OAuth token in credentials file", { cause: "auth" });
    // Never spend a request on a token we already know is dead. Sending one
    // earns a 401, and a run of 401s earns a 429 whose backoff then hides good
    // data for up to 15 minutes — which is how a reboot used to blank the
    // gauges for far longer than the auth gap itself lasted.
    if (cred.expired) throw new Error("token expired — waiting for refresh", { cause: "auth" });
    if (cred.token === authDeadToken) throw new Error("token rejected — waiting for refresh", { cause: "auth" });
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${cred.token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
    });
    if (res.status === 429) {
      authWait = false;
      usageBackoff = Math.min(usageBackoff ? usageBackoff * 2 : 120_000, 900_000);
      throw new Error(`usage endpoint HTTP 429 (backing off to ${usageBackoff / 1000}s)`);
    }
    if (res.status === 401 || res.status === 403) {
      authDeadToken = cred.token;
      throw new Error(`usage endpoint HTTP ${res.status} — waiting for refresh`, { cause: "auth" });
    }
    // A 429 backoff must not survive a different failure, or one unrelated error
    // pins the poller at the 15-minute cap long after the throttle has lifted.
    usageBackoff = 0;
    if (!res.ok) throw new Error(`usage endpoint HTTP ${res.status}`);
    authWait = false;
    authDeadToken = null;
    const j = await res.json();
    if (!state.loggedRaw) {
      state.loggedRaw = true;
      log("usage raw shape:", JSON.stringify(j).slice(0, 1200));
    }
    const limits = Array.isArray(j.limits) ? j.limits : [];
    const fromLimit = (kind) => {
      const l = limits.find((x) => x.kind === kind);
      return l ? { pct: l.percent, resetsAt: l.resets_at } : null;
    };
    const scoped = limits.find((x) => x.kind === "weekly_scoped");
    // Every per-model bucket the account exposes, for the selectable model gauge
    const models = [];
    for (const l of limits) {
      if (l.kind !== "weekly_scoped") continue;
      const name = l.scope?.model?.display_name;
      if (name && typeof l.percent === "number") models.push({ name, pct: l.percent, resetsAt: l.resets_at ?? null });
    }
    for (const [key, name] of [["seven_day_opus", "Opus"], ["seven_day_sonnet", "Sonnet"]]) {
      const b = pickBucket(j[key]);
      if (b?.pct != null && !models.some((m) => m.name === name)) models.push({ name, pct: b.pct, resetsAt: b.resetsAt });
    }
    state.usage = {
      fiveHour: pickBucket(j.five_hour) ?? fromLimit("session"),
      weekly: pickBucket(j.seven_day) ?? fromLimit("weekly_all"),
      weeklyOpus: pickBucket(j.seven_day_opus),
      scopedPct: scoped?.percent ?? null,
      scopedName: scoped?.scope?.model?.display_name ?? null,
      models,
    };
    state.usageErr = null;
    lastUsageErrLogged = null;
    state.usageAt = Date.now();
    const fp5 = state.usage.fiveHour?.pct;
    if (typeof fp5 === "number") {
      state.pctHistory.push({ t: state.usageAt, pct: fp5 });
      state.pctHistory = state.pctHistory.filter((h) => state.usageAt - h.t < 3.6e6);
    }
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ usage: state.usage, at: state.usageAt })); } catch {}
    // One line per poll so the adaptive rate is visible when something looks stale
    log(`usage: 5h=${state.usage.fiveHour?.pct ?? "?"}% wk=${state.usage.weekly?.pct ?? "?"}% next=${nextUsageDelay() / 1000}s`);
    scheduleResetPoll();
  } catch (e) {
    authWait = e.cause === "auth";
    state.usageErr = String(e.message ?? e);
    // Auth waits retry every 15s. Logging every one of them buried the rest of
    // the log during the ~6 minutes a post-reboot refresh can take.
    if (state.usageErr !== lastUsageErrLogged) {
      lastUsageErrLogged = state.usageErr;
      log("usage poll failed:", state.usageErr);
    }
  }
  renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate"]);
}

// Poll right after a limit window resets so gauges don't sit on stale 100%
let resetTimer = null;
function scheduleResetPoll() {
  const deltas = [state.usage?.fiveHour?.resetsAt, state.usage?.weekly?.resetsAt]
    .filter(Boolean)
    .map((iso) => new Date(iso).getTime() - Date.now())
    .filter((d) => d > 0 && d < 6 * 3.6e6);
  if (!deltas.length) return;
  clearTimeout(resetTimer);
  resetTimer = setTimeout(pollUsage, Math.min(...deltas) + 8000);
}

// ---------- data: running sessions ----------
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// `entrypoint` says who started a session: "cli" is a terminal the user opened,
// "claude-desktop" is one launched from the app, "sdk-*" is spawned
// programmatically by an Agent SDK harness. SDK sessions are live processes with
// no window and no status, and one orchestrator can hold a dozen — counting them
// makes the key read wildly higher than what the user can see. Deny-list rather
// than allow-list so an unfamiliar user-facing entrypoint still counts.
const isAgentSession = (s) => typeof s.entrypoint === "string" && s.entrypoint.startsWith("sdk");

async function pollSessions() {
  try {
    const files = await fsp.readdir(SESSIONS_DIR).catch(() => []);
    const out = [];
    let agents = 0;
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const s = JSON.parse(await fsp.readFile(path.join(SESSIONS_DIR, f), "utf8"));
        if (!s.pid || !pidAlive(s.pid)) continue;
        if (isAgentSession(s)) agents++;
        else out.push(s);
      } catch {}
    }
    out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    // Diff against the previous poll so the terminal tile has something to tail
    const before = new Map(state.sessions.map((s) => [s.pid, s]));
    for (const s of out) {
      const was = before.get(s.pid);
      if (!was) pushLog("start", s.name, "opened");
      else if (was.status !== s.status) pushLog(s.status && s.status !== "idle" ? "busy" : "idle", s.name, s.status ?? "?");
    }
    for (const [pid, s] of before) if (!out.some((x) => x.pid === pid)) pushLog("end", s.name, "closed");
    const changed = agents !== state.agents ||
      JSON.stringify(out.map((s) => [s.pid, s.status])) !== JSON.stringify(state.sessions.map((s) => [s.pid, s.status]));
    state.sessions = out;
    state.agents = agents;
    if (changed) renderAll(["sessions", "focus-session"]);
  } catch (e) {
    log("sessions poll failed:", String(e));
  }
}

// ---------- data: today's activity (local JSONL, incremental-ish) ----------
const fileCache = new Map(); // path -> { size, mtime, msgs, tokens }
const todayKey = () => new Date().toISOString().slice(0, 10);
const localDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function pollToday() {
  try {
    const day = localDay(Date.now());
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    let msgs = 0, tokens = 0;
    const chats = new Set();
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const d of dirs) {
      const dir = path.join(PROJECTS_DIR, d);
      let files;
      try { files = await fsp.readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try { st = await fsp.stat(fp); } catch { continue; }
        if (st.mtimeMs < dayStart.getTime()) continue; // untouched today
        chats.add(fp);
        const cached = fileCache.get(fp);
        if (cached && cached.size === st.size && cached.day === day) {
          msgs += cached.msgs; tokens += cached.tokens;
          continue;
        }
        let fMsgs = 0, fTokens = 0;
        try {
          const text = await fsp.readFile(fp, "utf8");
          // One assistant message streams as several snapshot lines, each
          // stamped with the whole request's usage — count each request once
          // (max, in case a later snapshot carries the final totals).
          const reqTok = new Map(); // message.id/requestId -> tokens
          const seenMsg = new Set();
          for (const line of text.split("\n")) {
            if (!line) continue;
            let j;
            try { j = JSON.parse(line); } catch { continue; }
            if (!j.timestamp || localDay(j.timestamp) !== day) continue;
            const mid = j.message?.id ?? j.requestId;
            if (j.type === "user") fMsgs++;
            else if (j.type === "assistant" && (!mid || !seenMsg.has(mid))) {
              if (mid) seenMsg.add(mid);
              fMsgs++;
            }
            const u = j.message?.usage;
            if (!u) continue;
            const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            if (mid) reqTok.set(mid, Math.max(reqTok.get(mid) ?? 0, tok));
            else fTokens += tok;
          }
          for (const tok of reqTok.values()) fTokens += tok;
        } catch { continue; }
        fileCache.set(fp, { size: st.size, day, msgs: fMsgs, tokens: fTokens });
        msgs += fMsgs; tokens += fTokens;
      }
    }
    state.today = { chats: chats.size, msgs, tokens };
    renderAll(["today"]);
  } catch (e) {
    log("today poll failed:", String(e));
  }
}

// ---------- data: last 7 days (local JSONL, per-file cache) ----------
const weekCache = new Map(); // path -> { size, from, days: { day: {tokens, msgs} } }
let lastWeekPoll = 0;
let chartMetric = "tokens";  // toggled by pressing any bar column in the chart profile

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Step a real Date rather than subtracting 864e5 — a DST boundary inside the
// window would otherwise skew every day key past it by an hour.
function weekDayKeys() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (CHART_DAYS - 1));
  const out = [];
  for (let i = 0; i < CHART_DAYS; i++) {
    out.push({ day: localDay(d.getTime()), label: DOW[d.getDay()] });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Same dedup rule as pollToday: one streamed response writes a line per content
// block and every line repeats that request's cumulative usage, so count each
// message id once (max, since a later snapshot can carry the final totals).
async function scanWeekFile(fp, wanted) {
  const out = {};
  const bucket = (day) => (out[day] ??= { tokens: 0, msgs: 0 });
  let text;
  try { text = await fsp.readFile(fp, "utf8"); } catch { return out; }
  const reqs = new Map();   // message id -> { day, tok }
  const seenMsg = new Set();
  for (const line of text.split("\n")) {
    if (!line) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (!j.timestamp) continue;
    const day = localDay(j.timestamp);
    if (!wanted.has(day)) continue;
    const mid = j.message?.id ?? j.requestId;
    if (j.type === "user") bucket(day).msgs++;
    else if (j.type === "assistant" && (!mid || !seenMsg.has(mid))) {
      if (mid) seenMsg.add(mid);
      bucket(day).msgs++;
    }
    const u = j.message?.usage;
    if (!u) continue;
    const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    if (!mid) { bucket(day).tokens += tok; continue; }
    const r = reqs.get(mid);
    if (r) r.tok = Math.max(r.tok, tok);
    else reqs.set(mid, { day, tok });
  }
  for (const r of reqs.values()) bucket(r.day).tokens += r.tok;
  return out;
}

async function pollWeek() {
  lastWeekPoll = Date.now();
  try {
    const keys = weekDayKeys();
    const from = keys[0].day;
    const wanted = new Set(keys.map((k) => k.day));
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (CHART_DAYS - 1));
    const startMs = start.getTime();
    const totals = new Map(keys.map((k) => [k.day, { tokens: 0, msgs: 0 }]));
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const dname of dirs) {
      const dir = path.join(PROJECTS_DIR, dname);
      let files;
      try { files = await fsp.readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try { st = await fsp.stat(fp); } catch { continue; }
        if (st.mtimeMs < startMs) continue; // nothing written inside the window
        let c = weekCache.get(fp);
        // `from` is part of the key so the whole cache invalidates at midnight
        if (!c || c.size !== st.size || c.from !== from) {
          c = { size: st.size, from, days: await scanWeekFile(fp, wanted) };
          weekCache.set(fp, c);
        }
        for (const [day, b] of Object.entries(c.days)) {
          const t = totals.get(day);
          if (!t) continue;
          t.tokens += b.tokens; t.msgs += b.msgs;
        }
      }
    }
    for (const fp of weekCache.keys()) {
      if (weekCache.get(fp).from !== from) weekCache.delete(fp);
    }
    const today = localDay(Date.now());
    state.week = {
      days: keys.map((k) => ({ ...k, ...totals.get(k.day), isToday: k.day === today })),
      at: Date.now(),
    };
    renderAll(["chart-cell", "chart-open"]);
  } catch (e) {
    log("week poll failed:", String(e));
  }
}

// ---------- data: burn rate (incremental tail of recent transcripts) ----------
const hourTracker = new Map(); // file -> { offset, rest, events: [{t, tok}] }

let burnPrimed = false;

async function pollBurn() {
  try {
    const now = Date.now();
    const scanCutoff = now - 90 * 60_000;
    const fresh = new Map(); // project dir -> tokens seen this tick, for the terminal tile
    const dirs = await fsp.readdir(PROJECTS_DIR).catch(() => []);
    for (const d of dirs) {
      const dir = path.join(PROJECTS_DIR, d);
      let files;
      try { files = await fsp.readdir(dir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fp = path.join(dir, f);
        let st;
        try { st = await fsp.stat(fp); } catch { continue; }
        if (st.mtimeMs < scanCutoff) continue;
        let rec = hourTracker.get(fp);
        if (!rec || st.size < rec.offset || !rec.seen) rec = { offset: 0, rest: "", events: [], seen: new Map() };
        if (st.size > rec.offset) {
          const fh = await fsp.open(fp, "r");
          try {
            const len = st.size - rec.offset;
            const buf = Buffer.alloc(len);
            await fh.read(buf, 0, len, rec.offset);
            rec.offset = st.size;
            const lines = (rec.rest + buf.toString("utf8")).split("\n");
            rec.rest = lines.pop() ?? "";
            for (const line of lines) {
              if (!line) continue;
              let j;
              try { j = JSON.parse(line); } catch { continue; }
              const u = j.message?.usage;
              if (!u || !j.timestamp) continue;
              const tok = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
              if (!tok) continue;
              // Snapshot lines repeat one request's usage — one event per
              // request id, updated in place if a later snapshot grows.
              const mid = j.message?.id ?? j.requestId;
              const ev = mid && rec.seen.get(mid);
              if (ev) { ev.tok = Math.max(ev.tok, tok); continue; }
              const e = { t: new Date(j.timestamp).getTime(), tok };
              if (mid) rec.seen.set(mid, e);
              rec.events.push(e);
              fresh.set(d, (fresh.get(d) ?? 0) + tok);
            }
          } finally { await fh.close(); }
        }
        rec.events = rec.events.filter((e) => now - e.t < 65 * 60_000);
        for (const [mid, ev] of rec.seen) if (now - ev.t >= 65 * 60_000) rec.seen.delete(mid);
        hourTracker.set(fp, rec);
      }
    }
    // The first pass reads whole file tails, so everything looks "new" — don't
    // report that backlog as if it just happened.
    if (burnPrimed) {
      for (const [dir, tok] of [...fresh.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2))
        pushLog("tok", dir.split("-").filter(Boolean).pop() ?? "claude", `+${fmtNum(tok)} tok`);
    }
    burnPrimed = true;
    let tokensHour = 0;
    for (const rec of hourTracker.values()) for (const e of rec.events) if (now - e.t < 3.6e6) tokensHour += e.tok;
    state.burn = { tokensHour, at: now };
    renderAll(["burn-rate"]);
  } catch (e) {
    log("burn poll failed:", String(e));
  }
}

// Projects time-to-cap from the trend of 5h utilization samples
function sessionEta() {
  const h = state.pctHistory;
  if (h.length < 2) return "measuring…";
  const latest = h[h.length - 1];
  const past = h.find((s) => latest.t - s.t >= 10 * 60_000) ?? h[0];
  const dt = latest.t - past.t;
  if (dt < 4 * 60_000) return "measuring…";
  const slope = (latest.pct - past.pct) / dt;
  if (slope <= 5e-8) return "steady";
  const msLeft = (100 - latest.pct) / slope;
  const resetMs = state.usage?.fiveHour?.resetsAt ? new Date(state.usage.fiveHour.resetsAt).getTime() - latest.t : Infinity;
  if (msLeft >= resetMs) return "resets first";
  const hh = Math.floor(msLeft / 3.6e6), mm = Math.round((msLeft % 3.6e6) / 6e4);
  return hh > 0 ? `cap in ~${hh}h ${mm}m` : `cap in ~${mm}m`;
}

// ---------- websocket / stream deck plumbing ----------
function argOf(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const views = new Map(); // context -> { kind, settings, coords, device }
const cycle = new Map(); // context -> { idx, timer }
const focusIdx = new Map(); // context -> session index
const deviceTypes = new Map(); // device id -> Stream Deck device type
let ws = null;
let animPhase = 0;
let pluginUUID = null;

// The 7-day chart takes over the deck by switching to a profile bundled in the
// .sdPlugin folder (manifest "Profiles"). Name must match both the manifest
// entry and the .streamDeckProfile filename. XL only — a profile is tied to one
// DeviceType, and the deck has to be 8x4 for the layout to mean anything.
const CHART_PROFILE = "Claude 7-Day Chart";
const DEVICE_XL = 2;

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
const setImage = (context, image) => send({ event: "setImage", context, payload: { image, target: 0 } });
const setTitle = (context) => send({ event: "setTitle", context, payload: { title: "", target: 0 } });
const showOk = (context) => send({ event: "showOk", context });
const showAlert = (context) => send({ event: "showAlert", context });
// context here is the *plugin* uuid, not the key's. Omitting `profile` is the
// documented way to return to whatever profile was showing before the switch —
// that's the whole back button, no bookkeeping needed on our side.
const switchProfile = (device, profile) =>
  send({ event: "switchToProfile", context: pluginUUID, device, payload: profile ? { profile } : {} });

const kindOf = (action) => action.replace("com.technicallybrantley.claude-deck.", "");

// What a gauge says when there is no reading at all. "sign in?" was wrong for
// the common case: after a reboot the user is signed in, the stored token just
// hasn't been refreshed yet, and telling them to sign in sends them chasing a
// problem that resolves itself the moment Claude Code starts.
function usageErrSub() {
  const e = state.usageErr ?? "";
  if (e.includes("429")) return "throttled";
  if (authWait) return "auth refreshing…";
  if (!state.usageErr) return "no data";
  return "unavailable";
}

// A reading we couldn't refresh still beats "--", but it has to be labelled or
// it reads as live. Only kicks in past two poll intervals so normal jitter
// doesn't flag every gauge as stale.
const USAGE_STALE_MS = 4 * 60_000;
function usageStale() {
  if (!state.usageAt) return null;
  const age = Date.now() - state.usageAt;
  if (age < USAGE_STALE_MS) return null;
  return age < 3.6e6 ? `${Math.round(age / 6e4)}m old` : `${Math.round(age / 3.6e6)}h old`;
}

function render(context, kind) {
  switch (kind) {
    case "usage-session": {
      const b = state.usage?.fiveHour;
      if (!b) return setImage(context, gaugeKey("SESSION 5H", null, usageErrSub()));
      if (b.pct >= 100 && b.resetsAt) return setImage(context, capKey("SESSION CAP", b.resetsAt, CAP_5H, animPhase));
      return setImage(context, gaugeKey("SESSION 5H", b.pct ?? null, usageStale() ?? fmtReset(b.resetsAt), b.pct >= 90 ? animPhase : null));
    }
    case "usage-weekly": {
      const b = state.usage?.weekly;
      if (!b) return setImage(context, gaugeKey("WEEKLY", null, usageErrSub()));
      if (b.pct >= 100 && b.resetsAt) return setImage(context, capKey("WEEKLY CAP", b.resetsAt, CAP_7D, animPhase));
      const u = state.usage;
      const sub = usageStale() ?? (u?.scopedPct != null && u.scopedName
        ? `${u.scopedName} ${Math.round(u.scopedPct)}%`
        : u?.weeklyOpus?.pct != null ? `opus ${Math.round(u.weeklyOpus.pct)}%`
        : fmtReset(b.resetsAt));
      return setImage(context, gaugeKey("WEEKLY", b.pct ?? null, sub, b.pct >= 90 ? animPhase : null));
    }
    case "usage-model": {
      const models = state.usage?.models ?? [];
      const want = views.get(context)?.settings?.model;
      const m = models.find((x) => x.name === want) ?? models[0];
      const name = (m?.name ?? want ?? "MODEL").toUpperCase().slice(0, 8);
      if (m?.pct >= 100 && m.resetsAt) return setImage(context, capKey(`${name} CAP`, m.resetsAt, CAP_7D, animPhase));
      if (!m) return setImage(context, gaugeKey(`${name} 7D`, null, usageErrSub()));
      return setImage(context, gaugeKey(`${name} 7D`, m.pct ?? null, usageStale() ?? (m.resetsAt ? fmtReset(m.resetsAt) : "no data"), m.pct >= 90 ? animPhase : null));
    }
    case "burn-rate":
      return setImage(context, burnKey(state.burn?.tokensHour ?? null, sessionEta()));
    case "project": {
      const s = views.get(context)?.settings ?? {};
      const label = s.label || (s.path ? path.basename(s.path) : "");
      return setImage(context, labelKey("PROJECT", label || "configure", s.path ? "" : "set folder in settings"));
    }
    case "focus-session": {
      const i = focusIdx.get(context);
      const s = i != null && state.sessions.length ? state.sessions[i % state.sessions.length] : null;
      return setImage(context, labelKey("FOCUS", s ? s.name : `${state.sessions.length} sessions`, s ? s.status : "press to cycle", C.ok));
    }
    case "quick-prompt": {
      const s = views.get(context)?.settings ?? {};
      return setImage(context, labelKey("PROMPT", s.label || "configure", s.prompt ? "" : "set prompt in settings"));
    }
    case "custom": {
      const s = views.get(context)?.settings ?? {};
      return setImage(context, labelKey("CLAUDE", s.label || "custom", s.command ? "" : "set command in settings"));
    }
    case "sessions": {
      const cy = cycle.get(context);
      const n = state.sessions.length;
      if (cy && cy.idx >= 0 && state.sessions[cy.idx]) {
        const s = state.sessions[cy.idx];
        const status = s.status ?? "?";
        return setImage(context, linesKey(`${cy.idx + 1}/${n}`, [
          { text: (s.name ?? "session").slice(0, 11), big: false, color: C.text },
          { text: status, color: status === "idle" ? C.dim : C.ok },
          { text: fmtAgo(s.startedAt ?? Date.now()) + " old", color: C.dim },
        ]));
      }
      const busy = state.sessions.filter((s) => s.status && s.status !== "idle").length;
      const a = state.agents;
      // Background SDK agents are reported as "+N sdk" rather than folded into the
      // count — they're real work, but they aren't windows you can switch to.
      const sub = n === 0
        ? (a > 0 ? `${a} sdk only` : "none running")
        : (busy > 0 ? `${busy} working` : "all idle") + (a > 0 ? ` +${a} sdk` : "");
      return setImage(context, bigCountKey("CLAUDE CODE", n, sub, busy > 0 ? C.ok : C.dim, busy > 0 ? animPhase : null, a > 0 ? 15 : 17));
    }
    case "activity": case "term": case "life": case "history": case "pipes":
      return renderTiles(kind, false);
    case "chart-open":
      return setImage(context, chartOpenKey(state.week?.days ?? [], chartMetric));
    case "chart-cell": {
      const c = views.get(context)?.coords ?? { column: 0, row: 0 };
      return setImage(context, chartCell(c.column, c.row));
    }
    case "today": {
      const t = state.today;
      return setImage(context, linesKey("TODAY", [
        { text: `${t?.chats ?? "--"} chats`, color: C.text },
        { text: `${fmtNum(t?.msgs)} msgs`, color: C.text },
        { text: `${fmtNum(t?.tokens)} tok`, color: C.accent },
      ]));
    }
  }
}

// One key of the takeover profile. Position comes from the key's coordinates, so
// the bundled profile is 32 identical action instances with no baked-in settings.
function chartCell(column, row) {
  const days = state.week?.days ?? [];
  const metric = chartMetric;
  const unit = metric === "msgs" ? "msgs" : "tokens";
  if (column < CHART_DAYS) {
    const d = days[column];
    if (!d) return chartStatKey("", "--", row === CHART_ROWS - 1 ? "no data" : "", C.dim);
    const max = Math.max(...days.map((x) => dayVal(x, metric)), 1);
    return barCellKey(d, row, max, metric);
  }
  if (row === CHART_ROWS - 1) return backCellKey();
  const vals = days.map((d) => dayVal(d, metric));
  const total = vals.reduce((a, b) => a + b, 0);
  if (row === 0) return chartStatKey("7-DAY TOTAL", fmtNum(total), unit);
  if (row === 1) {
    const peak = vals.length ? Math.max(...vals) : 0;
    const on = days[vals.indexOf(peak)];
    return chartStatKey("PEAK DAY", fmtNum(peak), on ? on.label.toLowerCase() : "", C.accentHi);
  }
  return chartStatKey("PER DAY", fmtNum(Math.round(total / (vals.length || 1))), "avg " + unit, C.text);
}

function renderAll(kinds) {
  for (const [context, v] of views) if (kinds.includes(v.kind)) render(context, v.kind);
}

// Every key of a tile is redrawn together: they share one canvas, and adding or
// removing a key changes the bounding box for all of them. Grouped by device so
// two blocks on two decks don't get merged into one oversized canvas.
const TILE_KINDS = ["activity", "term", "life", "history", "pipes", "scuttle"];
// ms = frame interval while a session is working. idleMs 0 means freeze at rest:
// push one final calm frame and then stop sending until work resumes.
const TILE_SPEC = {
  activity: { ms: 110, idleMs: 0 },
  pipes:    { ms: 130, idleMs: 0 },
  life:     { ms: 220, idleMs: 0 },
  term:     { ms: 120, idleMs: 260 },   // keeps typing/blinking even when quiet
  history:  { ms: 400, idleMs: 1200 },  // the graph should keep scrolling
  scuttle:  { ms: 140, idleMs: 0 },     // walks while Claude works, then naps
};
let tilesT0 = Date.now();
let tilesPaused = false;
const tileRunning = new Set();
const tileLast = new Map();
const sims = new Map();   // per block+size simulation state (Life board, pipe paths)

// ---------- tile: Scuttle ----------
// A pixel critter that walks the block while Claude is working. Sprites are a
// character grid: '#' a full cell, '=' a lower-half cell (the dark top edge
// reads as an eye), '(' / ')' the lower-right / lower-left quarter cells.
//
// The art below is original, and deliberately *data* rather than drawing code.
// Third-party mascot artwork doesn't belong in this repo — same call the README
// already makes about the Claude logo — but a sprite you hold a personal-use
// licence for can be dropped in as local-assets/sprite.json, which deploy.ps1
// copies into the installed folder and which replaces this at load time. Any
// grid works; the walk geometry reads its width off the rows.
const SPR_PX = 12, SPR_PY = 16;   // even numbers only — halves must land on whole pixels
const SPRITE_DEFAULT = {
  body: C.accent,
  //         0123456789A
  walkA: ["  #     #  ",
          "  #######  ",
          " ##=###=## ",
          " ######### ",
          "# #  #  # #"],
  walkB: [" #       # ",
          "  #######  ",
          " ##=###=## ",
          " ######### ",
          " ## # # ## "],
  // Eyes closed (no '=' notches), antennae down, legs tucked: the single frame
  // held while nothing is running.
  sleep: ["   #   #   ",
          "  #######  ",
          " ######### ",
          " ######### ",
          "  ##   ##  "],
  agent: ["  #  ",
          " ### ",
          " # # "],
};
let SPRITE = SPRITE_DEFAULT;
try {
  const s = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "sprite.json"), "utf8"));
  const rows = (a) => Array.isArray(a) && a.length && a.every((r) => typeof r === "string");
  // Every pose must be present and rectangular, or a half-valid file would draw
  // a creature with a missing frame rather than falling back cleanly.
  if (["walkA", "walkB", "sleep"].every((k) => rows(s[k]) && s[k].every((r) => r.length === s.walkA[0].length))) {
    SPRITE = { ...SPRITE_DEFAULT, ...s };
    log("sprite: local override loaded");
  } else log("sprite: local override ignored (malformed)");
} catch {}
const sprW = () => SPRITE.walkA[0].length;

// Mirrored so it faces the way it is walking. Reversing a row also has to swap
// which quarter cell each corner glyph is, or they point the wrong way.
const sprFlip = (rows) => rows.map((r) =>
  [...r].reverse().map((c) => (c === "(" ? ")" : c === ")" ? "(" : c)).join(""));

// Emits only the cells landing on this key; without the cull every key in the
// block would carry the whole sprite.
function sprDraw(rows, x0, y0, px, py, ox, color) {
  const fill = color ?? SPRITE.body;
  const R = (rx, ry, rw, rh) =>
    `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}"/>`;
  // Snapped to whole pixels. Neighbouring cells share an edge, and on fractional
  // coordinates the renderer antialiases both sides of that seam — which draws a
  // hairline grid straight through him wherever he isn't key-aligned.
  x0 = Math.round(x0); y0 = Math.round(y0);
  let out = "";
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === " ") continue;
      const x = x0 + c * px - ox, y = y0 + r * py;
      if (x > KEY + 1 || x + px < -1) continue;
      const hx = px >> 1, hy = py >> 1;
      if (ch === "#") out += R(x, y, px, py);
      else if (ch === "=") out += R(x, y + hy, px, hy);
      else if (ch === "(") out += R(x + hx, y + hy, hx, hy);
      else if (ch === ")") out += R(x, y + hy, hx, hy);
    }
  }
  return out;
}

// He travels in key units, not pixels. A sprite halfway across the physical gap
// gets sliced into two pieces that read as two small animals rather than one
// bisected creature — same reason the terminal tile quantizes to the key grid.
// Easing hard at both ends of each step keeps him whole and centred for most of
// the cycle and darts him across the gap, which is how a crab moves anyway.
// Easing alone isn't enough — it only reshapes where he is per tick, so he still
// spends ~28% of each step visibly split. Standing still at both ends of the
// step and darting across the middle is what actually fixes it, and it reads
// better besides: pause, scuttle, pause is what the animal does.
//
// Where he rests is a grid cell, never a pixel. He stands on key (col,row) and
// hops to an adjacent one, and every position is an interpolation *between two
// key homes* — so at rest (t === 0) he is exactly centred on a key by
// construction. That is what makes "may cross a gap, may not live in one"
// structural instead of a patch applied per axis.
//
// The earlier version tracked a single fractional coordinate and centred the
// sprite on the whole canvas, which is correct for a 1-row block and wrong for
// every other shape: on a 2x2 it parked him at y=104 of a 288px canvas, i.e.
// straddling the seam, so he lived at the point where all four keys meet.
// Anything that reintroduces "centre on the canvas" brings that straight back.
const smoother = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const sprHomeX = (c) => c * KEY + Math.round((KEY - sprW() * SPR_PX) / 2);
const sprHomeY = (r) => r * KEY + Math.round((KEY - SPRITE.walkA.length * SPR_PY) / 2);
const sprPos = (sim) => {
  const e = smoother(sim.t);
  return [
    sprHomeX(sim.col) + (sprHomeX(sim.tcol) - sprHomeX(sim.col)) * e,
    sprHomeY(sim.row) + (sprHomeY(sim.trow) - sprHomeY(sim.row)) * e,
  ];
};
// Legs move only while actually hopping; flapping them at rest is a treadmill.
// A single-key block has nowhere to go, so it marches on the spot instead.
const sprStepping = (sim) => sim.t > 0 || (sim.cols < 2 && sim.rows < 2);

// Prefers carrying on the way it's already facing, so it paces the block rather
// than jittering on one key. Vertical hops are the minority so the walk still
// reads as a walk.
function sprAim(sim) {
  if (sim.rows < 2 || Math.random() < 0.72) {
    let c = sim.col + sim.dir;
    if (c < 0 || c >= sim.cols) { sim.dir *= -1; c = sim.col + sim.dir; }
    if (c >= 0 && c < sim.cols) { sim.tcol = c; sim.trow = sim.row; return true; }
  }
  const up = Math.random() < 0.5 ? 1 : -1;
  for (const d of [up, -up]) {
    const r = sim.row + d;
    if (r >= 0 && r < sim.rows) { sim.trow = r; sim.tcol = sim.col; return true; }
  }
  return false;
}

// Idle business. Parked on a key he'll occasionally fish out something to play
// with or pull a face. Deliberately drawn from these grids rather than from
// extra sprite poses, so a swapped-in sprite.json gets the same repertoire
// without having to supply anything more than a walk and a sleep.
const ACT_ART = {
  heart: [" # # ", "#####", "#####", " ### ", "  #  "],
  excl:  ["##", "##", "##", "  ", "##"],
  ball:  [" ## ", "####", "####", " ## "],
  bubble:[" ## ", "#  #", "#  #", " ## "],
};
// Ticks, at TILE_SPEC.scuttle.ms (140ms) each.
const ACT_LEN = { ball: 40, bubble: 30, jump: 12, heart: 24, excl: 12, spin: 12 };
const SPR_ACTS = Object.keys(ACT_LEN);
const rollAct = () => 40 + Math.floor(Math.random() * 120);   // 5.6s–22s between bits

function scuttleStep(sim, busy) {
  // The same telemetry the rain tile reads: how fast it scuttles is the burn
  // rate, and more sessions working hurry it along.
  const burn = state.burn?.tokensHour ?? 0;
  sim.phase++;
  // An act holds him in place until it finishes — he shouldn't juggle mid-stride.
  if (sim.act) {
    if (++sim.actT >= ACT_LEN[sim.act]) { sim.act = null; sim.actNext = rollAct(); }
    return;
  }
  sim.actNext--;
  // Mid-hop he is over a gap, so an act — the one thing that holds him still for
  // seconds — may only begin from a standstill.
  if (sim.t === 0 && sim.actNext <= 0) {
    sim.act = SPR_ACTS[Math.floor(Math.random() * SPR_ACTS.length)];
    sim.actT = 0;
    return;
  }
  if (sim.t > 0) {
    // Mid-hop: finish it. Faster when there's more work going through.
    sim.t = Math.min(1, sim.t + 0.10 + Math.min(0.09, burn / 1e8) + Math.min(0.03, busy * 0.006));
    if (sim.t >= 1) { sim.col = sim.tcol; sim.row = sim.trow; sim.t = 0; sim.rest = 4 + Math.floor(Math.random() * 12); }
    return;
  }
  // Standing on a key. Pause a beat, then pick somewhere to go.
  if (--sim.rest > 0) return;
  if (sprAim(sim)) sim.t = 1e-6;   // non-zero starts the hop; still ~exactly home
}

// Whatever he's currently playing with, drawn beside or above him. Returns "" on
// the acts that are pure body movement (jump, spin) — those come out of the
// pose and offset instead.
function sprActArt(sim, x, y0, sw, sh, ox) {
  const a = sim.act, k = sim.actT;
  if (!a) return "";
  // He fills 132 of the key's 144px, so there is no room to put a prop *beside*
  // him — anything alongside lands on top of his own silhouette. Everything goes
  // in the headroom above instead, which is also the only direction a prop can
  // drift out of frame cleanly. Props are drawn in a contrasting colour for the
  // same reason: body-coloured, they just read as part of him.
  const mid = x + sw / 2, P = 6;
  if (a === "ball") {
    // Bounced off the top of his head and caught again.
    const bx = mid - 12 + Math.sin(k * 0.3) * 24;
    const by = y0 - 30 + Math.abs(Math.cos(k * 0.3)) * 14;
    return sprDraw(ACT_ART.ball, bx, by, P, P, ox, C.text);
  }
  if (a === "bubble") {
    // Blown upward, drifting, and gone for the last few ticks — it popped.
    if (k > ACT_LEN.bubble - 5) return "";
    return sprDraw(ACT_ART.bubble, mid - 12 + Math.sin(k * 0.22) * 10, y0 - 18 - k * 1.4, P, P, ox, C.ok);
  }
  if (a === "heart") return sprDraw(ACT_ART.heart, mid - 15 + Math.sin(k * 0.25) * 4, y0 - 26 - k * 0.7, P, P, ox, C.bad);
  if (a === "excl") return sprDraw(ACT_ART.excl, mid - 6, y0 - 34 + (k < 3 ? (3 - k) * 6 : 0), P, P, ox, C.warn);
  return "";
}

function scuttleCellKey(lc, lr, cols, rows, t, sim, busy) {
  const ox = lc * KEY, sw = sprW() * SPR_PX, sh = SPRITE.walkA.length * SPR_PY;
  const walking = busy > 0;
  // He must never come to *rest* between keys. idleMs 0 freezes this tile
  // wherever it stands, and that frozen frame is what gets looked at for
  // minutes — so a mid-hop freeze doesn't read as crossing, it reads as living
  // in the gap. Land him on whichever key he was nearer. Idempotent, so running
  // it once per key in the group is harmless. The act goes too, or he freezes
  // mid-jump and sleeps in the air.
  if (!walking) {
    if (sim.t > 0.5) { sim.col = sim.tcol; sim.row = sim.trow; }
    sim.tcol = sim.col; sim.trow = sim.row; sim.t = 0; sim.act = null;
  }
  const [x, ry] = sprPos(sim);
  const stepping = walking && !sim.act && sprStepping(sim) && sim.phase % 2;
  // jump arcs the whole body; spin flips his facing every tick on the spot.
  const hop = sim.act === "jump" ? -Math.round(Math.sin((sim.actT / ACT_LEN.jump) * Math.PI) * 24) : 0;
  const bob = stepping ? -2 : 0;   // half-step lift, so it isn't gliding
  // Vertically anchored to the key row he's standing on — NOT centred on the
  // canvas, which is the same thing on a 1-row block and a seam-straddling bug
  // on every other shape.
  const y0 = ry + bob + hop - lr * KEY;
  let pose = !walking ? SPRITE.sleep : stepping ? SPRITE.walkB : SPRITE.walkA;
  let agent = SPRITE.agent;
  const facing = sim.act === "spin" ? (sim.actT % 2 ? -sim.dir : sim.dir) : sim.dir;
  if (facing < 0) { pose = sprFlip(pose); agent = sprFlip(agent); }
  let out = sprDraw(pose, x, y0, SPR_PX, SPR_PY, ox);
  if (walking) out += sprActArt(sim, x, y0, sw, sh, ox);
  // SDK agents trail behind in the smaller pose. pollSessions() already counts
  // them separately from the sessions the user can actually see.
  for (let i = 1; walking && i <= Math.min(3, state.agents ?? 0); i++) {
    // Even cell sizes only: quarter cells are drawn at half a cell, and an odd
    // size rounds that half down into a seam.
    const ax = x - sim.dir * (sw * 0.5 + i * 40);
    out += sprDraw(agent, ax, y0 + SPR_PY * 2, 8, 12, ox);
  }
  if (!walking) {
    // One 'z' so a frozen key still reads as asleep rather than as a dead tile.
    const zx = x + (sim.dir > 0 ? sw - 6 : -14) - ox;
    if (zx > -20 && zx < KEY + 20)
      out += `<text x="${zx.toFixed(1)}" y="${(y0 + 6).toFixed(1)}" font-family="${MONO}" font-size="18" fill="${C.dim}">z</text>`;
  }
  // Most keys are empty most frames, and skipping the setImage outright is real
  // savings at this rate — but a key it has just walked off needs one blank
  // frame first, or it keeps showing the half it last drew.
  const id = lc + "," + lr;
  if (!out) {
    if (!sim.painted.has(id)) return null;
    sim.painted.delete(id);
    return svgWrap("", false);
  }
  sim.painted.add(id);
  return svgWrap(out, false);
}

function simFor(kind, key, cols, rows) {
  let s = sims.get(key);
  if (s) return s;
  const W = cols * KEY, H = rows * KEY;
  if (kind === "life") {
    const w = Math.max(4, Math.floor(W / LIFE_CELL)), h = Math.max(4, Math.floor(H / LIFE_CELL));
    s = { w, h, cur: new Uint8Array(w * h), prev: null, pop: 0, stale: 0 };
    lifeSeed(s, 1);
  } else if (kind === "pipes") {
    s = { w: Math.max(3, Math.floor(W / PIPE_CELL)), h: Math.max(3, Math.floor(H / PIPE_CELL)), pipes: [], cells: 0, fade: 0 };
  } else if (kind === "history") {
    s = { bucketMs: 30_000 };
  } else if (kind === "scuttle") {
    s = { col: 0, row: rows - 1, tcol: 0, trow: rows - 1, t: 0, rest: 1, dir: 1,
          phase: 0, cols, rows, painted: new Set(), act: null, actT: 0, actNext: rollAct() };
  } else s = {};
  sims.set(key, s);
  return s;
}

function tileStep(kind, sim, busy) {
  if (kind === "life") lifeStep(sim, busy);
  else if (kind === "pipes") pipeStep(sim, busy);
  else if (kind === "scuttle") scuttleStep(sim, busy);
}

function tileCell(kind, lc, lr, cols, rows, t, sim, busy, burn) {
  switch (kind) {
    case "activity": return rainCellKey(lc, lr, cols, rows, t, busy, burn);
    case "term": return termCellKey(lc, lr, cols, rows, t);
    case "life": return lifeCellKey(lc, lr, cols, rows, t, sim);
    case "history": return historyCellKey(lc, lr, cols, rows, t, sim);
    case "pipes": return pipesCellKey(lc, lr, cols, rows, t, sim);
    case "scuttle": return scuttleCellKey(lc, lr, cols, rows, t, sim, busy);
  }
}

function renderTiles(kind, step) {
  const groups = new Map();
  for (const [context, v] of views) {
    if (v.kind !== kind) continue;
    const key = v.device ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([context, v]);
  }
  if (!groups.size) return;
  const t = Date.now() - tilesT0;
  const busy = tilesPaused ? 0 : state.sessions.filter((s) => s.status && s.status !== "idle").length;
  const burn = state.burn?.tokensHour ?? 0;
  for (const [device, group] of groups) {
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
    for (const [, v] of group) {
      minC = Math.min(minC, v.coords.column); maxC = Math.max(maxC, v.coords.column);
      minR = Math.min(minR, v.coords.row); maxR = Math.max(maxR, v.coords.row);
    }
    const cols = maxC - minC + 1, rows = maxR - minR + 1;
    const sim = simFor(kind, `${kind}|${device}|${cols}x${rows}`, cols, rows);
    if (step) tileStep(kind, sim, busy);   // sims advance once per frame, not per key
    for (const [context, v] of group) {
      const img = tileCell(kind, v.coords.column - minC, v.coords.row - minR, cols, rows, t, sim, busy, burn);
      if (img) setImage(context, img);
    }
  }
}

// ---------- key actions ----------
function launchDesktop(context) {
  const child = spawn("explorer.exe", [desktopAppId], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function quickChat(context) {
  // Global quick-chat hotkey Ctrl+Alt+Space via keybd_event (SendKeys can't do Space chords reliably)
  const ps = `
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
[K.W]::keybd_event(0x11,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [K.W]::keybd_event(0x20,0,0,[UIntPtr]::Zero);
Start-Sleep -Milliseconds 60;
[K.W]::keybd_event(0x20,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x12,0,2,[UIntPtr]::Zero); [K.W]::keybd_event(0x11,0,2,[UIntPtr]::Zero);`;
  const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function openWeb(context) {
  const child = spawn("cmd.exe", ["/c", "start", "", "https://claude.ai/new"], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function openTerminalAt(dir, context) {
  const psFallback = () => {
    const fb = spawn("cmd.exe", ["/c", "start", "", "powershell", "-NoExit", "-Command", `cd '${dir}'; claude`], { detached: true, stdio: "ignore" });
    fb.on("error", () => showAlert(context));
    fb.unref();
  };
  // Windows Terminal is single-instance: without `-w new` it opens a hidden tab
  // in whatever window already exists, so force a fresh foreground window.
  const wt = spawn("cmd.exe", ["/c", "start", "", "wt", "-w", "new", "-d", dir, "powershell", "-NoExit", "-Command", "claude"], { detached: true, stdio: "ignore" });
  wt.on("error", psFallback);
  wt.on("exit", (code) => { if (code !== 0) psFallback(); });
  wt.unref();
  showOk(context);
}

// Bring the terminal window hosting a session to the foreground (matched by title substring)
function focusWindow(s, context) {
  const target = (String(s.name ?? "").replace(/["'‘’“”]/g, "").slice(0, 40) || path.basename(s.cwd ?? "")).toLowerCase();
  if (!target) return showAlert(context);
  const ps = `
$target = '${target.replace(/'/g, "''")}';
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public class W { public delegate bool EP(IntPtr h, IntPtr l); [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb, IntPtr l); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }';
$found = [IntPtr]::Zero;
[void][W]::EnumWindows({ param($h, $l) $sb = New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText($h, $sb, 512); if ([W]::IsWindowVisible($h) -and $sb.ToString().ToLower().Contains($target)) { $script:found = $h; return $false }; return $true }, [IntPtr]::Zero);
if ($found -eq [IntPtr]::Zero) { exit 1 };
[void][W]::ShowWindow($found, 9); [void][W]::SetForegroundWindow($found); exit 0`;
  execFile("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], (err) => {
    if (err) showAlert(context); else showOk(context);
  });
}

// Quick chat + paste a canned prompt (clipboard is overwritten)
function sendPrompt(text, enter, context) {
  const ps = `
Set-Clipboard -Value '${String(text).replace(/'/g, "''")}';
Add-Type -Namespace K -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);';
function P([byte]$k){[K.W]::keybd_event($k,0,0,[UIntPtr]::Zero)}; function R([byte]$k){[K.W]::keybd_event($k,0,2,[UIntPtr]::Zero)};
P 0x11; P 0x12; P 0x20; Start-Sleep -Milliseconds 60; R 0x20; R 0x12; R 0x11;
Start-Sleep -Milliseconds 800;
P 0x11; P 0x56; Start-Sleep -Milliseconds 60; R 0x56; R 0x11;
${enter ? "Start-Sleep -Milliseconds 200; P 0x0D; R 0x0D;" : ""}`;
  const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function runCustom(command, context) {
  const child = spawn("cmd.exe", ["/c", "start", "", command], { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

function onKeyDown(context, kind, device) {
  switch (kind) {
    case "activity": case "term": case "life": case "history": case "pipes":
      tilesPaused = !tilesPaused;   // a big animated block is worth being able to mute
      for (const k of TILE_KINDS) renderTiles(k, false);
      return showOk(context);
    case "chart-open": {
      if (!device) return showAlert(context);
      const type = deviceTypes.get(device);
      if (type != null && type !== DEVICE_XL) {
        log(`chart: device type ${type} is not XL, no bundled profile to switch to`);
        return showAlert(context);
      }
      if (Date.now() - lastWeekPoll > 15_000) pollWeek();
      return switchProfile(device, CHART_PROFILE);
    }
    case "chart-cell": {
      const c = views.get(context)?.coords ?? { column: 0, row: 0 };
      if (c.column >= CHART_DAYS && c.row === CHART_ROWS - 1) return switchProfile(device, null);
      if (c.column >= CHART_DAYS) {           // side panel: force a re-read
        pollWeek();
        return showOk(context);
      }
      chartMetric = chartMetric === "tokens" ? "msgs" : "tokens";
      return renderAll(["chart-cell", "chart-open"]);
    }
    case "usage-session":
    case "usage-weekly":
      if (Date.now() - lastUsageAttempt > 30_000) pollUsage();
      return showOk(context);
    case "today":
      pollToday();
      return showOk(context);
    case "sessions": {
      const n = state.sessions.length;
      if (n === 0) return showAlert(context);
      const cy = cycle.get(context) ?? { idx: -1, timer: null };
      cy.idx = (cy.idx + 1) % n;
      if (cy.timer) clearTimeout(cy.timer);
      cy.timer = setTimeout(() => { cycle.set(context, { idx: -1, timer: null }); render(context, "sessions"); }, 4000);
      cycle.set(context, cy);
      return render(context, "sessions");
    }
    case "usage-model":
      if (Date.now() - lastUsageAttempt > 30_000) pollUsage();
      return showOk(context);
    case "burn-rate":
      pollBurn();
      return showOk(context);
    case "project": {
      const s = views.get(context)?.settings ?? {};
      if (!s.path) return showAlert(context);
      return openTerminalAt(s.path, context);
    }
    case "focus-session": {
      const n = state.sessions.length;
      if (!n) return showAlert(context);
      const i = ((focusIdx.get(context) ?? -1) + 1) % n;
      focusIdx.set(context, i);
      focusWindow(state.sessions[i], context);
      return render(context, "focus-session");
    }
    case "quick-prompt": {
      const s = views.get(context)?.settings ?? {};
      if (!s.prompt) return showAlert(context);
      return sendPrompt(s.prompt, !!s.enter, context);
    }
    case "custom": {
      const s = views.get(context)?.settings ?? {};
      if (!s.command) return showAlert(context);
      return runCustom(s.command, context);
    }
    case "launch": return launchDesktop(context);
    case "quick-chat": return quickChat(context);
    case "open-web": return openWeb(context);
    case "claude-code": return openTerminalAt(DEFAULT_CODE_DIR, context);
  }
}

// ---------- selftest mode (no Stream Deck needed) ----------
if (process.argv.includes("--selftest")) {
  (async () => {
    log("selftest: polling usage…");
    await pollUsage();
    log("selftest usage:", state.usage ? JSON.stringify(state.usage) : `ERROR: ${state.usageErr}`);
    await pollSessions();
    log(`selftest sessions (${state.sessions.length} shown, ${state.agents} sdk agents hidden):`,
      state.sessions.map((s) => `${s.name}[${s.status}]`).join(", ") || "(none)");
    await pollToday();
    log("selftest today:", JSON.stringify(state.today));
    await pollBurn();
    log("selftest burn:", JSON.stringify(state.burn), "eta:", sessionEta());
    // nextUsageDelay() is a pure function of state, so every band can be checked
    // here instead of waiting to actually cap out to find a threshold typo.
    const savedUsage = state.usage;
    log("selftest poll rate:");
    for (const [name, pct, dt] of [
      ["idle 12%", 12, 5 * 3.6e6],
      ["warm 80%", 80, 3 * 3.6e6],
      ["hot 97%", 97, 2 * 3.6e6],
      ["capped, 90s to reset", 100, 90_000],
      ["30s past reset", 100, -30_000],
      ["10m past reset (bounded)", 100, -10 * 60_000],
    ]) {
      state.usage = { fiveHour: { pct, resetsAt: new Date(Date.now() + dt).toISOString() } };
      log(`  ${name.padEnd(26)} -> ${nextUsageDelay() / 1000}s`);
    }
    state.usage = savedUsage;

    // The post-reboot path. A dead token must not be resent (that is what earns
    // the 429 whose backoff then blanks the gauges for 15 minutes), and an auth
    // wait must not inherit a leftover 429 interval.
    const [savedBackoff, savedWait] = [usageBackoff, authWait];
    log("selftest auth handling:");
    usageBackoff = 900_000; authWait = true;
    log(`  ${"auth wait beats 429 backoff".padEnd(26)} -> ${nextUsageDelay() / 1000}s`);
    authWait = false;
    log(`  ${"429 backoff alone".padEnd(26)} -> ${nextUsageDelay() / 1000}s`);
    usageBackoff = savedBackoff; authWait = savedWait;

    // A cached reading has to announce its age or it passes for live.
    const savedAt = state.usageAt;
    log("selftest stale label:");
    for (const [name, age] of [["fresh 30s", 30_000], ["8 min", 8 * 60_000], ["overnight 14h", 14 * 3.6e6]]) {
      state.usageAt = Date.now() - age;
      log(`  ${name.padEnd(26)} -> ${usageStale() ?? "(live, no label)"}`);
    }
    state.usageAt = savedAt;

    // Scuttle may cross the gap between keys but must never come to rest in one.
    // This was missed once by previewing only 1-row blocks, where "centre on the
    // canvas" and "centre on the key row" happen to be the same answer — on a
    // 2x2 it parked him on the seam where all four keys meet. Assert the shapes
    // instead of eyeballing a strip.
    log("selftest scuttle (at rest, sprite must fit inside one key):");
    const sprSW = sprW() * SPR_PX, sprSH = SPRITE.walkA.length * SPR_PY;
    for (const [cols, rows] of [[1, 1], [4, 1], [2, 2], [3, 2], [8, 4]]) {
      const sim = simFor("scuttle", `selftest|scuttle|${cols}x${rows}`, cols, rows);
      const seen = new Set();
      let bad = 0;
      for (let i = 0; i < 6000; i++) {
        scuttleStep(sim, 2);
        if (sim.t !== 0) continue;               // mid-hop is allowed to straddle
        const [x, y] = sprPos(sim);
        if (x < sim.col * KEY || x + sprSW > (sim.col + 1) * KEY ||
            y < sim.row * KEY || y + sprSH > (sim.row + 1) * KEY) bad++;
        seen.add(`${sim.col},${sim.row}`);
      }
      log(`  ${`${cols}x${rows}`.padEnd(5)} ${bad ? `OFF-KEY ${bad}x` : "always on a key"}, reached ${seen.size}/${cols * rows} keys`);
    }

    const t0 = Date.now();
    await pollWeek();
    log(`selftest week (${Date.now() - t0}ms, ${weekCache.size} files):`);
    for (const d of state.week?.days ?? []) {
      const max = Math.max(...state.week.days.map((x) => x.tokens), 1);
      const bar = "#".repeat(Math.round(28 * (d.tokens / max)));
      log(`  ${d.day} ${d.label}${d.isToday ? "*" : " "} ${String(fmtNum(d.tokens)).padStart(6)} tok ${String(d.msgs).padStart(5)} msgs |${bar}`);
    }
    process.exit(0);
  })();
} else if (process.argv.includes("--preview")) {
  // Renders the whole chart profile to one SVG so the layout can be checked
  // without a physical deck: `npm run preview -- --out chart.svg [--metric msgs]`
  (async () => {
    const body = (uri) => decodeURIComponent(uri.slice(uri.indexOf(",") + 1))
      .replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const place = (uri, x, y) => `<svg x="${x}" y="${y}" width="${KEY}" height="${KEY}" viewBox="0 0 ${KEY} ${KEY}">${body(uri)}</svg>`;
    const PITCH = KEY + 8; // fake the physical gap between keys
    const label = (x, y, s) => `<text x="${x}" y="${y}" font-family="Segoe UI, sans-serif" font-size="19" fill="#9b96a8">${s}</text>`;
    let inner = "", w, h;

    const tile = process.argv.includes("--rain") ? "activity" : argOf("--tile");
    if (process.argv.includes("--cap")) {
      // npm run preview -- --cap --out cap.svg
      const now = Date.now();
      const cases = [
        ["session 2h41m", "SESSION CAP", now + (2 * 3600 + 41 * 60 + 7) * 1000, CAP_5H],
        ["session 47m", "SESSION CAP", now + (47 * 60 + 12) * 1000, CAP_5H],
        ["session 38s", "SESSION CAP", now + 38_000, CAP_5H],
        ["weekly 3d", "WEEKLY CAP", now + (3 * 86400 + 4 * 3600 + 31 * 60) * 1000, CAP_7D],
        ["model 19h", "FABLE CAP", now + (19 * 3600 + 5 * 60) * 1000, CAP_7D],
        ["past reset", "WEEKLY CAP", now - 5_000, CAP_7D],
      ];
      cases.forEach(([lbl, cap, at, win], i) => {
        inner += place(capKey(cap, new Date(at).toISOString(), win, i), i * PITCH, 40);
        inner += label(i * PITCH, 28, lbl);
      });
      w = cases.length * PITCH; h = 40 + KEY;
    } else if (tile) {
      // Several frames side by side, since a still can't show motion:
      // npm run preview -- --tile life --out life.svg [--cols 3 --rows 4 --busy 3]
      await pollSessions();
      await pollBurn();
      const cols = Number(argOf("--cols") ?? 3), rows = Number(argOf("--rows") ?? 4);
      const busy = Number(argOf("--busy") ?? Math.max(1, state.sessions.filter((s) => s.status && s.status !== "idle").length));
      const burn = Number(argOf("--burn") ?? state.burn?.tokensHour ?? 0);
      // Backdate the seeded log so the terminal tile shows finished lines plus
      // one mid-type, instead of every line arriving at once
      state.log.forEach((l, i) => { l.t = Date.now() - (state.log.length - i) * 380; });
      const sim = simFor(tile, `preview|${tile}|${cols}x${rows}`, cols, rows);
      // -1 renders the idle/at-rest state. More frames than the default three is
      // the only way to judge an animation that is only occasionally wrong —
      // the walker straddling a key gap: `npm run preview -- --frames 12`
      const nf = Math.max(1, Number(argOf("--frames") ?? 3));
      const frames = [...Array(nf)].map((_, i) => i * 400).concat([-1]);
      const blockW = cols * PITCH;
      // Advance by the tile's own frame rate rather than a fixed count, or the
      // preview animates something the deck never runs. It also matters for
      // sampling: a fixed count that divides evenly into a tile's cycle lands on
      // the same phase every frame, which made the walker look mid-gap in 1 of
      // 4 when he is actually there ~16% of the time.
      const perFrame = Math.max(1, Math.round(400 / (TILE_SPEC[tile]?.ms ?? 140)));
      // Scuttle's bits of business fire at random, so waiting for one to show up
      // in a preview is hopeless: `--act ball` pins it and walks the act's own
      // clock forward across the strip instead.
      const forceAct = argOf("--act");
      frames.forEach((t, k) => {
        if (k > 0 && t >= 0) for (let i = 0; i < perFrame; i++) tileStep(tile, sim, busy);
        if (forceAct && t >= 0) { sim.act = forceAct; sim.actT = Math.min(k * 2, (ACT_LEN[forceAct] ?? 20) - 1); }
        const x0 = k * (blockW + 34);
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < rows; r++) {
            // A tile may return null for "leave this key alone" (scuttle does,
            // the keys he isn't standing on). The deck keeps the previous image
            // there; a flat preview has to draw the empty key itself.
            const img = tileCell(tile, c, r, cols, rows, Math.max(0, t), sim, t < 0 ? 0 : busy, burn);
            inner += place(img ?? svgWrap("", false), x0 + c * PITCH, 40 + r * PITCH);
          }
        inner += label(x0, 28, t < 0 ? "at rest (nothing busy)" : `${tile} — t = ${t}ms`);
      });
      w = frames.length * (blockW + 34) - 34;
      h = 40 + rows * PITCH;
      log(`tile preview: ${tile} ${cols}x${rows}, busy=${busy}, burn=${fmtNum(burn)}/hr, log=${state.log.length} lines`);
    } else {
      await pollWeek();
      chartMetric = argOf("--metric") ?? "tokens";
      for (let col = 0; col < CHART_COLS; col++)
        for (let row = 0; row < CHART_ROWS; row++)
          inner += place(chartCell(col, row), col * PITCH, row * PITCH);
      const openY = CHART_ROWS * PITCH + 24;
      inner += place(chartOpenKey(state.week?.days ?? [], chartMetric), 0, openY);
      inner += label(KEY + 20, openY + 42, `launcher key (on the normal profile) — metric: ${chartMetric}`);
      w = CHART_COLS * PITCH - 8;
      h = openY + KEY;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#0b0a0e"/>${inner}</svg>`;
    const out = argOf("--out") ?? path.join(process.cwd(), "chart-preview.svg");
    fs.writeFileSync(out, svg);
    log(`preview written: ${out}`);
    process.exit(0);
  })();
} else {
  const port = argOf("-port");
  pluginUUID = argOf("-pluginUUID");
  const registerEvent = argOf("-registerEvent");
  log(`starting: port=${port} uuid=${pluginUUID}`);

  ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.on("open", () => {
    send({ event: registerEvent, uuid: pluginUUID });
    log("registered with Stream Deck");
    pushLog("info", "boot", "claude-deck ok");
    pushLog("info", "tail", "~/.claude/sessions");
    pushLog("info", "watch", "burn-rate 60s");
    if (Date.now() - state.usageAt > 90_000) pollUsage();
    pollSessions();
    pollToday();
  });
  ws.on("close", () => { log("socket closed, exiting"); process.exit(0); });
  ws.on("error", (e) => { log("socket error:", String(e)); });
  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const { event, context, action } = msg;
    if (event === "deviceDidConnect") {
      deviceTypes.set(msg.device, msg.deviceInfo?.type);
    } else if (event === "willAppear" && action) {
      const kind = kindOf(action);
      views.set(context, {
        kind,
        settings: msg.payload?.settings ?? {},
        coords: msg.payload?.coordinates ?? { column: 0, row: 0 },
        device: msg.device,
      });
      setTitle(context);
      // The chart profile appearing is the signal that the user just opened it
      if ((kind === "chart-cell" || kind === "chart-open") && Date.now() - lastWeekPoll > 15_000) pollWeek();
      render(context, kind);
    } else if (event === "willDisappear") {
      views.delete(context);
      cycle.delete(context);
      focusIdx.delete(context);
    } else if (event === "didReceiveSettings" && action) {
      const v = views.get(context);
      if (v) { v.settings = msg.payload?.settings ?? {}; render(context, v.kind); }
    } else if (event === "sendToPlugin" && action) {
      if (msg.payload?.cmd === "getModels") {
        send({ event: "sendToPropertyInspector", context, payload: { models: (state.usage?.models ?? []).map((m) => m.name) } });
      }
    } else if (event === "keyDown" && action) {
      onKeyDown(context, kindOf(action), msg.device ?? views.get(context)?.device);
    }
  });

  (function usageLoop() { setTimeout(async () => { await pollUsage(); usageLoop(); }, nextUsageDelay()); })();
  setInterval(pollSessions, 5_000);
  setInterval(pollToday, 300_000);
  pollBurn();
  setInterval(pollBurn, 60_000);
  // The 7-day scan is the most expensive poll (whole transcripts, not a tail),
  // so it only runs while a key that shows it is actually on screen.
  setInterval(() => {
    if ([...views.values()].some((v) => v.kind === "chart-cell" || v.kind === "chart-open")) pollWeek();
  }, 300_000);
  // Tile frame pump. Each kind has its own rate, and a kind only costs anything
  // when its keys are actually on screen — 12 keys of setImage at speed is real
  // load on the Stream Deck app, so idle tiles either slow down or stop entirely.
  setInterval(() => {
    const busy = state.sessions.filter((s) => s.status && s.status !== "idle").length;
    const active = busy > 0 && !tilesPaused;
    const now = Date.now();
    for (const kind of TILE_KINDS) {
      if (![...views.values()].some((v) => v.kind === kind)) { tileRunning.delete(kind); continue; }
      const interval = active ? TILE_SPEC[kind].ms : TILE_SPEC[kind].idleMs;
      if (!interval) {
        if (tileRunning.has(kind)) { tileRunning.delete(kind); renderTiles(kind, false); }
        continue;
      }
      if (now - (tileLast.get(kind) ?? 0) < interval) continue;
      tileLast.set(kind, now);
      tileRunning.add(kind);
      renderTiles(kind, active);
    }
  }, 60);
  // Animation ticker: busy-session dots + red pulse on gauges at 90%+
  setInterval(() => {
    animPhase = (animPhase + 1) % 3;
    const kinds = [];
    if (state.sessions.some((s) => s.status && s.status !== "idle")) kinds.push("sessions");
    if (state.usage?.fiveHour?.pct >= 90) kinds.push("usage-session");
    if (state.usage?.weekly?.pct >= 90) kinds.push("usage-weekly");
    if ((state.usage?.models ?? []).some((m) => m.pct >= 90)) kinds.push("usage-model");
    if (kinds.length && [...views.values()].some((v) => kinds.includes(v.kind))) renderAll(kinds);
    // Safety net: a reset time has passed but we still show pre-reset data (missed timer / resume from sleep)
    const expired = [state.usage?.fiveHour, state.usage?.weekly]
      .some((b) => b?.resetsAt && Date.now() - new Date(b.resetsAt).getTime() > 5000);
    if (expired && !state.usageErr && Date.now() - lastUsageAttempt > 30_000) pollUsage();
  }, 600);
  // Keep countdowns ("1h 5m left") fresh between polls
  setInterval(() => renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate"]), 30_000);
}
