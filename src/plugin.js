// Claude Deck — Stream Deck plugin
// Shows live Claude subscription usage (same numbers as Claude Desktop / /usage),
// running Claude Code sessions, and quick-launch keys.
import { WebSocket } from "ws";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let PLUGIN_VERSION = "";
try { PLUGIN_VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8")).Version ?? ""; } catch {}

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CREDS_FILE = path.join(CLAUDE_DIR, ".credentials.json");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const STATS_CACHE = path.join(CLAUDE_DIR, "stats-cache.json");
const TASKS_DIR = path.join(CLAUDE_DIR, "tasks");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const githubDir = path.join(os.homedir(), "Documents", "GitHub");
const DEFAULT_CODE_DIR = fs.existsSync(githubDir) ? githubDir : os.homedir();

// Claude Desktop (Microsoft Store) — resolved from the Start menu at startup so any install works
const IS_MAC = process.platform === "darwin";
const MAC_CLAUDE_BUNDLE = "com.anthropic.claudefordesktop";
// Claude Desktop is an MSIX Store app on Windows, addressed by AppUserModelId;
// macOS addresses it by bundle id instead, so this lookup is Windows-only. It
// was firing powershell.exe at module load on every platform.
let desktopAppId = "shell:AppsFolder\\Claude_pzs8sxrjxfjjc!Claude";
if (!IS_MAC) execFile("powershell.exe", ["-NoProfile", "-Command",
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
    <text x="14" y="27" font-family="${UI}" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(label)}</text>
    <text x="72" y="78" text-anchor="middle" font-family="${UI}" font-size="${has ? 46 : 34}" font-weight="700" fill="${has ? col : C.dim}">${has ? Math.round(p) + "%" : "--"}</text>
    <rect x="14" y="90" width="116" height="12" rx="6" fill="${C.track}"/>
    ${has ? `<rect x="14" y="90" width="${Math.max(8, (116 * p) / 100)}" height="12" rx="6" fill="${col}"/>` : ""}
    <text x="72" y="128" text-anchor="middle" font-family="${UI}" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`);
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

// When you actually work, as a 24-spoke dial. A radial layout beats a bar chart
// here because the day wraps: a run of late-night hours reads as one arc rather
// than as two stacks at opposite ends of an axis. Midnight is at the top.
function clockKey(hours, nowHour) {
  // A small centre hub and long spokes: the earlier version put the peak hour in
  // the middle, where it collided with the spokes and squeezed their dynamic
  // range into ~20px. The label belongs in the footer.
  const cx = 72, cy = 82, r0 = 14, rMax = 50;
  const peak = Math.max(1, ...hours);
  let out = "";
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
    // Every hour keeps a stub so a quiet hour reads as "nothing here" rather
    // than as a hole in the dial.
    const r1 = Math.max(r0 + 3, r0 + (rMax - r0) * (hours[h] / peak));
    const live = h === nowHour;
    out += `<line x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy + Math.sin(a) * r0).toFixed(1)}" ` +
           `x2="${(cx + Math.cos(a) * r1).toFixed(1)}" y2="${(cy + Math.sin(a) * r1).toFixed(1)}" ` +
           `stroke="${live ? C.ok : hours[h] ? C.accent : C.track}" stroke-width="${live ? 7 : 5}" stroke-linecap="round"/>`;
  }
  const busiest = hours.indexOf(Math.max(...hours));
  const h12 = (n) => `${n % 12 === 0 ? 12 : n % 12}${n < 12 ? "am" : "pm"}`;
  return svgWrap(`
    <text x="72" y="20" text-anchor="middle" font-family="${UI}" font-size="16" font-weight="600" letter-spacing="0.5" fill="${C.dim}">RHYTHM</text>
    ${out}
    <circle cx="${cx}" cy="${cy}" r="7" fill="${C.track}"/>
    <text x="72" y="139" text-anchor="middle" font-family="${UI}" font-size="15" fill="${C.dim}">busiest ${h12(busiest)}</text>`);
}

// Greedy wrap by character count. Segoe UI at these sizes averages ~0.52em per
// character, which is accurate enough for a 144px key and avoids having to
// measure text in a renderer that has no layout engine.
function wrapText(str, maxChars, maxLines) {
  const words = String(str ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else if (lines.length + 1 < maxLines) { lines.push(cur); cur = w; }
    else { cur = cur + " " + w; break; }        // last line: let it overflow, then clip
  }
  if (cur) lines.push(cur);
  if (lines.length === maxLines && lines[maxLines - 1].length > maxChars)
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1).trimEnd() + "…";
  return lines.slice(0, maxLines);
}

// The one key meant to be read from across the room. Three states, and the
// "hooks not installed" one matters: without it a plugin with no hook wiring
// looks identical to one where nothing needs you, which is the worst possible
// failure for an alert.
function attentionKey(a, hooksOn, phase) {
  if (!hooksOn) return svgWrap(`
    <text x="72" y="60" text-anchor="middle" font-family="${UI}" font-size="17" font-weight="600" fill="${C.dim}">ATTENTION</text>
    <text x="72" y="88" text-anchor="middle" font-family="${UI}" font-size="15" fill="${C.dim}">hooks off</text>
    <text x="72" y="110" text-anchor="middle" font-family="${UI}" font-size="12" fill="${C.track}">npm run install-hooks</text>`);
  if (!a) return svgWrap(`
    <circle cx="72" cy="66" r="26" fill="none" stroke="${C.ok}" stroke-width="6"/>
    <path d="M60 66 l8 9 l16 -19" fill="none" stroke="${C.ok}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="72" y="122" text-anchor="middle" font-family="${UI}" font-size="17" font-weight="600" fill="${C.dim}">all clear</text>`);
  const secs = Math.max(0, Math.round((Date.now() - a.at) / 1000));
  const wait = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const what = { permission_prompt: "permission", idle_prompt: "waiting", agent_needs_input: "needs input", elicitation_dialog: "input needed" }[a.kind] ?? a.kind;
  return svgWrap(`
    <rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${C.bad}" stroke-width="6" opacity="${[0.3, 0.65, 1][phase % 3]}"/>
    <text x="72" y="40" text-anchor="middle" font-family="${UI}" font-size="15" font-weight="700" letter-spacing="1" fill="${C.bad}">NEEDS YOU</text>
    <text x="72" y="72" text-anchor="middle" font-family="${UI}" font-size="20" font-weight="700" fill="${C.text}">${esc(what)}</text>
    <text x="72" y="98" text-anchor="middle" font-family="${UI}" font-size="15" fill="${C.dim}">${esc(String(a.name).slice(0, 16))}</text>
    <text x="72" y="126" text-anchor="middle" font-family="${MONO}" font-size="18" font-weight="700" fill="${C.warn}">${wait}</text>`, false);
}

// What Claude is doing right now, in its own words.
function taskKey(t) {
  if (!t) return linesKey("DOING", [{ text: "no task list", color: C.dim }]);
  const label = t.activeForm ?? t.subject ?? "—";
  const lines = wrapText(label, 17, 3);
  const frac = t.total ? t.done / t.total : 0;
  const body = lines.map((ln, i) =>
    `<text x="12" y="${58 + i * 22}" font-family="${UI}" font-size="16" font-weight="600" fill="${C.text}">${esc(ln)}</text>`).join("");
  return svgWrap(`
    <rect x="0" y="0" width="144" height="34" rx="18" fill="${C.panel}"/>
    <rect x="0" y="17" width="144" height="17" fill="${C.panel}"/>
    <text x="12" y="24" font-family="${UI}" font-size="17" font-weight="600" letter-spacing="0.5" fill="${t.blocked ? C.warn : C.accent}">DOING</text>
    <text x="132" y="24" text-anchor="end" font-family="${UI}" font-size="14" fill="${C.dim}">${t.done}/${t.total}</text>
    ${body}
    <rect x="12" y="126" width="120" height="8" rx="4" fill="${C.track}"/>
    <rect x="12" y="126" width="${Math.max(4, 120 * frac).toFixed(1)}" height="8" rx="4" fill="${C.ok}"/>`);
}

function linesKey(title, rows, accent = C.accent, note = null) {
  const rowSvg = rows
    .map((r, i) => {
      const y = 62 + i * 31;
      return `<text x="14" y="${y}" font-family="${UI}" font-size="${r.big ? 28 : 20}" font-weight="${r.big ? 700 : 600}" fill="${r.color ?? C.text}">${esc(r.text)}</text>`;
    })
    .join("");
  return svgWrap(`
    <rect x="0" y="0" width="144" height="34" rx="18" fill="${C.panel}"/>
    <rect x="0" y="17" width="144" height="17" fill="${C.panel}"/>
    <text x="14" y="24" font-family="${UI}" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${note ? `<text x="132" y="24" text-anchor="end" font-family="${UI}" font-size="13" fill="${C.dim}">${esc(note)}</text>` : ""}
    ${rowSvg}`);
}

function bigCountKey(title, count, sub, subColor, animPhase = null, subSize = 17) {
  // animPhase non-null → cycling activity dots beside the count (frame-pushed animation)
  const dots = animPhase == null ? "" : [0, 1, 2]
    .map((i) => `<circle cx="122" cy="${56 + i * 16}" r="${i === animPhase ? 4.5 : 3}" fill="${i === animPhase ? C.ok : C.track}"/>`)
    .join("");
  return svgWrap(`
    <text x="14" y="27" font-family="${UI}" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    ${dots}
    <text x="72" y="96" text-anchor="middle" font-family="${UI}" font-size="64" font-weight="700" fill="${count > 0 ? C.text : C.dim}">${count}</text>
    <text x="72" y="128" text-anchor="middle" font-family="${UI}" font-size="${subSize}" fill="${subColor ?? C.dim}">${esc(sub ?? "")}</text>`);
}

function burnKey(tokensHour, sub) {
  const has = tokensHour != null;
  return svgWrap(`
    <text x="14" y="27" font-family="${UI}" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">BURN RATE</text>
    <text x="72" y="82" text-anchor="middle" font-family="${UI}" font-size="40" font-weight="700" fill="${has ? C.accent : C.dim}">${has ? fmtNum(tokensHour) : "--"}</text>
    <text x="72" y="104" text-anchor="middle" font-family="${UI}" font-size="16" fill="${C.dim}">tok/hr</text>
    <text x="72" y="128" text-anchor="middle" font-family="${UI}" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
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
    .map((l, i) => `<text x="72" y="${lines.length > 1 ? 68 + i * 27 : 82}" text-anchor="middle" font-family="${UI}" font-size="22" font-weight="700" fill="${C.text}">${esc(l.slice(0, 12))}</text>`)
    .join("");
  return svgWrap(`
    <text x="14" y="27" font-family="${UI}" font-size="17" font-weight="600" letter-spacing="0.5" fill="${accent}">${esc(title)}</text>
    ${lineSvg}
    <text x="72" y="128" text-anchor="middle" font-family="${UI}" font-size="15" fill="${C.dim}">${esc(sub ?? "")}</text>`);
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
      <text x="72" y="${a + 20}" text-anchor="middle" font-family="${UI}" font-size="15" font-weight="600" letter-spacing="0.5" fill="${d.isToday ? col : C.dim}">${esc(d.label)}</text>
      <text x="72" y="${a + 37}" text-anchor="middle" font-family="${UI}" font-size="16" font-weight="700" fill="${C.text}">${fmtNum(v)}</text>`;
  }
  return svgWrap(out, false);
}

function chartStatKey(title, value, sub, color = C.accent) {
  return svgWrap(`
    <text x="14" y="27" font-family="${UI}" font-size="16" font-weight="600" letter-spacing="0.5" fill="${C.dim}">${esc(title)}</text>
    <text x="72" y="88" text-anchor="middle" font-family="${UI}" font-size="36" font-weight="700" fill="${color}">${esc(value)}</text>
    <text x="72" y="122" text-anchor="middle" font-family="${UI}" font-size="16" fill="${C.dim}">${esc(sub ?? "")}</text>`, false);
}

function backCellKey() {
  return svgWrap(`
    <path d="M86 34 L54 68 L86 102" fill="none" stroke="${C.accent}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="72" y="130" text-anchor="middle" font-family="${UI}" font-size="20" font-weight="700" letter-spacing="1" fill="${C.text}">BACK</text>`, false);
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
    : `<text x="72" y="84" text-anchor="middle" font-family="${UI}" font-size="20" fill="${C.dim}">--</text>`;
  const total = vals.reduce((a, b) => a + b, 0);
  return svgWrap(`
    <text x="14" y="27" font-family="${UI}" font-size="17" font-weight="600" letter-spacing="0.5" fill="${C.dim}">7 DAYS</text>
    ${bars}
    <rect x="13" y="103" width="119" height="2" rx="1" fill="${C.track}"/>
    <text x="72" y="130" text-anchor="middle" font-family="${UI}" font-size="17" font-weight="700" fill="${C.text}">${fmtNum(total)}${metric === "msgs" ? " msgs" : " tok"}</text>`);
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
// Neither Segoe UI nor Cascadia Mono exists on macOS. Without fallbacks every
// key silently falls back to a generic face with different metrics, and the
// hand-positioned SVG text drifts — so the whole plugin looks subtly broken
// rather than obviously broken. Apple faces come second so Windows is unchanged.
const UI = "Segoe UI, -apple-system, Helvetica Neue, sans-serif";
const MONO = "Cascadia Mono, Consolas, SF Mono, Menlo, monospace";
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
  attention: null,   // { kind, name, cwd, at } — Claude is blocked waiting on the user
  hookAt: 0,         // last hook received; 0 means the hooks aren't installed
  tasks: null,       // { name, activeForm, subject, done, total } for the busiest session
  stats: null,       // long history from stats-cache.json — see pollStats()
  statsAt: 0,
  loggedRaw: false,
};

// Claude Code owns the OAuth refresh — this plugin only reads what it wrote.
// `expiresAt` matters: after a reboot the stored token is usually already dead,
// and it stays dead until Claude Code next launches and refreshes it.
async function readToken() {
  // macOS does not use .credentials.json at all — Claude Code writes the token to
  // the Keychain and deletes that file — so the file path finds nothing and every
  // usage gauge sits dead. Reads via /usr/bin/security don't prompt, because the
  // item's ACL trusts that binary; with no GUI session it exits non-zero rather
  // than blocking, hence the hard timeout.
  if (IS_MAC) {
    const raw = await new Promise((res) => {
      execFile("/usr/bin/security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-a", os.userInfo().username, "-w"],
        { timeout: 4000 }, (err, out) => res(err ? null : out));
    });
    if (!raw) return null;
    let o;
    try { o = JSON.parse(raw)?.claudeAiOauth; } catch { return null; }
    if (!o?.accessToken) return null;
    return { token: o.accessToken, expired: typeof o.expiresAt === "number" && o.expiresAt <= Date.now() };
  }
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

const AUTH_RETRY = 15_000;   // cheap: re-reads the credentials file, no request
const USAGE_TIMEOUT = 15_000;   // a hung request must not stall the poll chain

// ---------- poll cadence: one self-tuning interval ----------
// Measured over 4.3h of production log (218 requests), grouped by the gap since
// the previous request: under 25s -> 77% REJECTED, 25-50s -> 60%, 80-100s ->
// 19%, 100-130s -> 2%, 130s+ -> 0%. Served throughput was pinned near 30/hr
// however hard we pushed.
//
// So the old adaptive bands were the bug, but only the fast ones: 15s near a
// reset and 20s over 95% were rejected 77% of the time, which made the gauge
// stale precisely when the number mattered most. The 90s BASELINE was fine —
// 81% served, and the log shows 25 consecutive clean polls at 90s tracking
// 7%->51% smoothly. Do not "fix" this by slowing the baseline down: a previous
// attempt moved everything to 125s and made ordinary tracking visibly worse
// than it had ever been.
//
// One interval, adapted from what the server actually does: start at the
// fastest rate that is mostly served, widen only when genuinely throttled,
// and decay back so a transient throttle can't permanently slow the deck.
const POLL_MIN = 90_000;    // fastest we ever ask; 81% served, and it tracks well
const POLL_MAX = 200_000;   // only reached if the server really is pushing back
const USER_SPACING = 10_000;   // floor between event-driven polls
let pollEvery = POLL_MIN;

let usageBackoff = 0;   // honoured Retry-After only; the interval does the rest
let usagePolling = false;
let authWait = false;   // token dead — waiting on Claude Code to refresh it
let authDeadToken = null;   // the exact token that 401'd, so we don't resend it
let lastUsageAttempt = 0;
let lastUsageErrLogged = null;

// A 429 costs exactly ONE interval, never more. The version of this that used a
// token bucket with a 2-token reserve needed *two* refills to recover, so every
// throttle punched a 4-minute hole in the gauge — worse than the problem it was
// written to solve. Recovery time is the number that matters here.
function nextUsageDelay() {
  // Auth waits are not throttles: the retry costs a file read, not a request,
  // so poll briskly to pick the new token up as soon as Claude Code writes it.
  if (authWait) return AUTH_RETRY;
  const sinceLast = Date.now() - lastUsageAttempt;
  return Math.max(usageBackoff, pollEvery - sinceLast, 5_000);
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
  // Resume the tuned interval rather than re-probing from scratch on every
  // restart — a run of deploys otherwise earns the throttle each time.
  if (typeof c.pollEvery === "number") pollEvery = Math.min(Math.max(c.pollEvery, POLL_MIN), POLL_MAX);
} catch {}

// priority "user" — a key press, a dial tap, a window rollover — answers now
// rather than waiting out the interval; "routine" (the default) paces at
// pollEvery. The spacing is enforced HERE, not at the call sites, so no present
// or future caller can stack requests: the 600ms expired-window ticker and a
// mashed key both land on the same floor.
async function pollUsage(priority = "routine") {
  if (usagePolling) return;
  if (Date.now() - lastUsageAttempt < (priority === "user" ? USER_SPACING : pollEvery)) return;
  usagePolling = true;
  lastUsageAttempt = Date.now();
  try {
    const cred = await readToken();
    if (!cred) throw new Error("no OAuth token in credentials file", { cause: "auth" });
    // Never spend a request on a token we already know is dead. Sending one
    // earns a 401, and a run of 401s earns a 429 whose backoff then hides good
    // data for minutes — which is how a reboot used to blank the gauges for
    // far longer than the auth gap itself lasted.
    if (cred.expired) throw new Error("token expired — waiting for refresh", { cause: "auth" });
    if (cred.token === authDeadToken) throw new Error("token rejected — waiting for refresh", { cause: "auth" });
    const res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${cred.token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(USAGE_TIMEOUT),
    });
    if (res.status === 429) {
      authWait = false;
      // Widen a little, and retry one interval from now — never more. Doubling
      // (120->240->480) is what produced the "8m old" holes, and a two-refill
      // bucket recovery produced 4-minute ones. A single throttled request must
      // cost a single interval.
      pollEvery = Math.min(pollEvery + 20_000, POLL_MAX);
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      usageBackoff = retryAfter > 0 ? Math.min(retryAfter, POLL_MAX) : 0;
      throw new Error(`usage endpoint HTTP 429 (interval now ${pollEvery / 1000}s)`);
    }
    if (res.status === 401 || res.status === 403) {
      authDeadToken = cred.token;
      throw new Error(`usage endpoint HTTP ${res.status} — waiting for refresh`, { cause: "auth" });
    }
    // A 429 backoff must not survive a different failure, or one unrelated error
    // pins the poller long after the throttle has lifted.
    usageBackoff = 0;
    if (!res.ok) throw new Error(`usage endpoint HTTP ${res.status}`);
    // Served cleanly: walk back toward the fast baseline, so a transient
    // throttle (or another client briefly competing for the same account
    // budget) can't permanently slow the deck down.
    if (pollEvery > POLL_MIN) pollEvery = Math.max(POLL_MIN, pollEvery - 10_000);
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
    // The tuned interval rides along in the cache so a restart resumes it.
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ usage: state.usage, at: state.usageAt, pollEvery }));
    } catch {}
    // One line per poll so the cadence is visible when something looks stale.
    log(`usage: 5h=${state.usage.fiveHour?.pct ?? "?"}% wk=${state.usage.weekly?.pct ?? "?"}% every=${pollEvery / 1000}s next=${Math.round(nextUsageDelay() / 1000)}s`);
    scheduleResetPoll();
  } catch (e) {
    authWait = e.cause === "auth";
    state.usageErr = e?.name === "TimeoutError"
      ? `usage request timed out after ${USAGE_TIMEOUT / 1000}s`
      : String(e.message ?? e);
    // Auth waits retry every 15s. Logging every one of them buried the rest of
    // the log during the ~6 minutes a post-reboot refresh can take.
    if (state.usageErr !== lastUsageErrLogged) {
      lastUsageErrLogged = state.usageErr;
      log("usage poll failed:", state.usageErr);
    }
  } finally {
    usagePolling = false;
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
  // A rollover is the one moment the number is guaranteed to have moved, so
  // this token is worth the reserve — it is how the gauge drops off 100%
  // promptly now that nothing polls in fast bands.
  resetTimer = setTimeout(() => pollUsage("user"), Math.min(...deltas) + 8000);
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

// ---------- hooks: Claude Code pushes, instead of us polling ----------
// Everything else here is pull: the plugin finds out because it looked. That is
// fine for numbers and useless for "Claude is blocked waiting on you" — by the
// time a 5s poll notices, you have already wandered off. Claude Code's hooks can
// POST straight at us, so the deck can go red the instant a permission prompt
// appears.
//
// Loopback only. This takes unauthenticated POSTs, and while all it can do is
// light up a key, it has no business being reachable off the machine.
const HOOK_PORT = 45822;
// Notification matchers that mean "a human is needed", as opposed to the ones
// that are merely informational.
const HOOK_BLOCKING = new Set(["permission_prompt", "idle_prompt", "agent_needs_input", "elicitation_dialog"]);

function startHookServer() {
  const srv = http.createServer((req, res) => {
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    let body = "";
    // A hook should never be able to wedge a turn, so cap the body and always
    // answer, whatever the payload turns out to be.
    req.on("data", (c) => { body += c; if (body.length > 65536) req.destroy(); });
    req.on("end", () => {
      res.writeHead(204).end();
      let j; try { j = JSON.parse(body); } catch { return; }
      try { onHook(j); } catch (e) { log("hook handler failed:", String(e)); }
    });
  });
  srv.on("error", (e) => {
    // Another instance, or something else on the port. Not fatal: the plugin
    // simply keeps working in poll-only mode and the Attention key says so.
    log(`hook listener unavailable (${e.code ?? e}); continuing without hooks`);
  });
  srv.listen(HOOK_PORT, "127.0.0.1", () => log(`hook listener on 127.0.0.1:${HOOK_PORT}`));
}

function onHook(j) {
  const ev = j.hook_event_name ?? j.event ?? "";
  const name = sessionNameFor(j) ?? path.basename(j.cwd ?? "") ?? "claude";
  // First hook through the door proves the wiring end to end, which is otherwise
  // invisible — the Attention key can't tell "installed and quiet" from "never
  // installed" without it.
  if (!state.hookAt) log("hooks connected — first event received");
  state.hookAt = Date.now();
  switch (ev) {
    case "Notification": {
      const m = j.matcher ?? j.notification_type ?? j.type ?? "";
      if (HOOK_BLOCKING.has(m)) {
        state.attention = { kind: m, name, cwd: j.cwd ?? null, at: Date.now() };
        log(`attention: ${name} needs you (${m})`);
        pushLog("busy", name, m.replace(/_/g, " "));
        renderAll(["attention"]);
      }
      return;
    }
    // Any of these mean the turn moved on, so whatever was blocking is resolved.
    case "Stop": case "SessionEnd": case "StopFailure":
      if (state.attention) {
        log(`attention: cleared by ${ev}`);
        state.attention = null;
        renderAll(["attention"]);
      }
      if (ev === "Stop") pushLog("idle", name, "turn done");
      return;
    case "SessionStart": pushLog("start", name, "session start"); break;
    case "SubagentStart": pushLog("start", name, `agent ${j.agent_type ?? ""}`.trim()); break;
    case "SubagentStop": pushLog("end", name, `agent ${j.agent_type ?? ""} done`.trim()); break;
    case "TaskCreated": pushLog("info", name, "task created"); break;
    case "TaskCompleted": pushLog("info", name, "task done"); pollTasks(); break;
    default: return;
  }
  renderAll(["attention"]);
}

// Hooks carry session_id; map it back to the friendly session name the rest of
// the plugin already uses so the log and the key agree on what to call things.
function sessionNameFor(j) {
  const id = j.session_id ?? j.sessionId;
  if (!id) return null;
  return state.sessions.find((s) => s.sessionId === id)?.name ?? null;
}

// ---------- data: what Claude is actually doing ----------
// Sessions carry a `sessionId`, and ~/.claude/tasks/<sessionId>/N.json holds that
// session's todo list. `activeForm` is the present-continuous phrasing ("Adding
// the current-task key"), which is written for exactly this kind of readout — use
// it in preference to `subject`.
//
// Only live sessions are read: the tasks directory keeps every session that ever
// had a list, so scanning all of it would mostly be reporting on work that
// finished days ago.
async function pollTasks() {
  try {
    const live = state.sessions.filter((s) => s.sessionId);
    // Prefer whoever is actually working; fall back to the most recently touched
    // so the key still says something useful while everything is idle.
    const ordered = [...live].sort((a, b) => {
      const busy = (x) => (x.status && x.status !== "idle" ? 1 : 0);
      return busy(b) - busy(a) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
    for (const sess of ordered) {
      const dir = path.join(TASKS_DIR, sess.sessionId);
      let files;
      try { files = await fsp.readdir(dir); } catch { continue; }
      const items = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try { items.push(JSON.parse(await fsp.readFile(path.join(dir, f), "utf8"))); } catch {}
      }
      if (!items.length) continue;
      items.sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
      const done = items.filter((t) => t.status === "completed").length;
      const current = items.find((t) => t.status === "in_progress") ?? items.find((t) => t.status === "pending");
      state.tasks = {
        name: sess.name,
        activeForm: current?.activeForm ?? null,
        subject: current?.subject ?? null,
        blocked: items.some((t) => t.status !== "completed" && (t.blockedBy ?? []).length > 0),
        done,
        total: items.length,
      };
      renderAll(["task"]);
      return;
    }
    if (state.tasks) { state.tasks = null; renderAll(["task"]); }
  } catch (e) {
    log("tasks poll failed:", String(e));
  }
}

// ---------- data: today's activity (local JSONL, incremental-ish) ----------
const fileCache = new Map(); // path -> { size, mtime, msgs, tokens }
const todayKey = () => new Date().toISOString().slice(0, 10);
const localDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ---------- data: long history ----------
// Claude Code precomputes ~36 days of activity into stats-cache.json, which is
// both cheaper than a transcript scan and a far longer window than the 7-day
// chart can show. Two things to know before leaning on it:
//
//  - It is NOT live. The file is recomputed periodically and routinely lags a
//    few days, so it is a history/aggregate source only. Anything describing
//    "now" keeps coming from pollToday() / pollBurn().
//  - `costUSD` is present but reads 0 on a subscription plan (it only fills in
//    for API billing), so there is deliberately no cost key here. Don't add one
//    without checking it is non-zero on the account in question.
async function pollStats() {
  try {
    const j = JSON.parse(await fsp.readFile(STATS_CACHE, "utf8"));
    const days = (Array.isArray(j.dailyActivity) ? j.dailyActivity : [])
      .filter((d) => d && typeof d.date === "string")
      .sort((a, b) => a.date.localeCompare(b.date));
    // hourCounts is keyed by hour-of-day and simply omits hours that never saw
    // activity — densify to 24 slots so callers can index it directly.
    const hours = Array.from({ length: 24 }, (_, h) => Number(j.hourCounts?.[h] ?? j.hourCounts?.[String(h)] ?? 0));
    const models = Object.entries(j.modelUsage ?? {})
      .map(([id, m]) => ({
        id,
        tokens: (m.inputTokens ?? 0) + (m.outputTokens ?? 0) +
                (m.cacheReadInputTokens ?? 0) + (m.cacheCreationInputTokens ?? 0),
      }))
      .sort((a, b) => b.tokens - a.tokens);
    state.stats = {
      days, hours, models,
      totalSessions: j.totalSessions ?? 0,
      totalMessages: j.totalMessages ?? 0,
      toolCalls: days.reduce((n, d) => n + (d.toolCallCount ?? 0), 0),
      firstAt: j.firstSessionDate ?? null,
      longest: j.longestSession ?? null,
      computedAt: j.lastComputedDate ?? null,
    };
    state.statsAt = Date.now();
    state.statsErr = null;
  } catch (e) {
    state.statsErr = String(e.message ?? e);
  }
  renderAll(["clock", "lifetime"]);
}

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
// Deliberately a no-op. Stream Deck's green tick covers the whole key for
// about a second, hiding exactly the tile the press just updated — on a deck
// of live gauges that reads as a glitch, not feedback. The tile changing *is*
// the acknowledgement. showAlert stays real: a failure has nothing else to
// show for itself.
const showOk = () => {};
const showAlert = (context) => send({ event: "showAlert", context });
// context here is the *plugin* uuid, not the key's. Omitting `profile` is the
// documented way to return to whatever profile was showing before the switch —
// that's the whole back button, no bookkeeping needed on our side.
const switchProfile = (device, profile) =>
  send({ event: "switchToProfile", context: pluginUUID, device, payload: profile ? { profile } : {} });

// ---------- Stream Deck + : dial and touch strip ----------
// The built-in $B1 layout is title + icon + value + bar, which *is* a usage
// gauge — so the encoder path draws no SVG at all, it just fills the layout in.
// Rotating cycles which number is on the strip, so one dial covers what several
// keys do on a Keypad.
const DIAL_METRICS = ["session", "weekly", "model", "burn", "today"];
const dialIdx = new Map();   // context -> index into DIAL_METRICS

const setFeedback = (context, payload) => send({ event: "setFeedback", context, payload });

function renderDial(context) {
  const metric = DIAL_METRICS[(dialIdx.get(context) ?? 0) % DIAL_METRICS.length];
  const u = state.usage;
  const pctOf = (b) => (b?.pct != null ? `${Math.round(b.pct)}%` : "--");
  let title = "", value = "--", bar = 0;
  switch (metric) {
    case "session": title = "Session 5h"; value = pctOf(u?.fiveHour); bar = u?.fiveHour?.pct ?? 0; break;
    case "weekly":  title = "Weekly";     value = pctOf(u?.weekly);   bar = u?.weekly?.pct ?? 0; break;
    case "model": {
      const m = (u?.models ?? [])[0];
      title = m?.name ? `${m.name} 7d` : "Model"; value = pctOf(m); bar = m?.pct ?? 0; break;
    }
    case "burn": {
      const t = state.burn?.tokensHour;
      // No natural 0-100 for a rate, so the bar is scaled against 50M/hr — enough
      // that a heavy session fills it without pinning at the first request.
      title = "Burn/hr"; value = fmtNum(t); bar = t ? Math.min(100, (t / 5e7) * 100) : 0; break;
    }
    case "today": title = "Today"; value = fmtNum(state.today?.tokens); bar = 0; break;
  }
  setFeedback(context, { title, value, indicator: { value: Math.max(0, Math.min(100, Math.round(bar))) } });
}

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
  // A dial has no image, only a layout. Routing here rather than per-case means
  // an action placed on an encoder can never fall through to setImage, which the
  // Stream Deck simply ignores.
  if (views.get(context)?.controller === "Encoder") return renderDial(context);
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
    case "attention":
      return setImage(context, attentionKey(state.attention, state.hookAt > 0, animPhase));
    case "task":
      return setImage(context, taskKey(state.tasks));
    case "clock": {
      const st = state.stats;
      if (!st) return setImage(context, linesKey("RHYTHM", [{ text: "no stats yet", color: C.dim }]));
      return setImage(context, clockKey(st.hours, new Date().getHours()));
    }
    case "lifetime": {
      const st = state.stats;
      if (!st) return setImage(context, linesKey("LIFETIME", [{ text: "no stats yet", color: C.dim }]));
      const since = st.firstAt ? new Date(st.firstAt).toLocaleDateString([], { month: "short", day: "numeric" }) : "--";
      return setImage(context, linesKey("LIFETIME", [
        { text: `${fmtNum(st.totalMessages)} msgs`, color: C.text },
        { text: `${fmtNum(st.toolCalls)} tools`, color: C.text },
        { text: `${st.totalSessions} sessions`, color: C.accent },
      ], C.accent, since === "--" ? null : since));
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
// Cell size is per-sprite so an override isn't forced into the shipped grid.
// Both must stay even: half and quarter cells are drawn at exactly px/2, py/2.
const SPRITE_DEFAULT = {
  body: C.accent,
  px: 12, py: 14,
  // An upright critter with a tuft, a wide brow and two feet. Its eyes are
  // *enclosed gaps* — blank cells with body above and below — which is a
  // different construction from cutting notches into a row's top edge, and the
  // reason no row here can coincide with a sprite built the other way.
  //        012345678
  walkA: ["   ###   ",
          " ####### ",
          "##  #  ##",
          " ####### ",
          "#########",
          " ##   ## "],
  walkB: ["   ###   ",
          " ####### ",
          "##  #  ##",
          " ####### ",
          "#########",
          "##     ##"],
  // Eyes shut (the gaps close), tuft down, feet tucked: the one frame it holds
  // while nothing is running.
  sleep: ["         ",
          "  #####  ",
          " ####### ",
          " ####### ",
          "#########",
          "  #####  "],
  agent: [" # ",
          "###",
          "# #"],
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
const sprPX = () => SPRITE.px ?? 12;
const sprPY = () => SPRITE.py ?? 16;
const sprSW = () => sprW() * sprPX();          // drawn width in px
const sprSH = () => SPRITE.walkA.length * sprPY();

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
const sprHomeX = (c) => c * KEY + Math.round((KEY - sprSW()) / 2);
const sprHomeY = (r) => r * KEY + Math.round((KEY - sprSH()) / 2);
const sprPos = (sim) => {
  // The vertical axis follows the ride's own curve — a slide accelerates, a
  // balloon eases off — while the horizontal stays smooth either way.
  const ex = smoother(sim.t);
  const ey = sim.style ? SPR_STYLE[sim.style].ease(sim.t) : ex;
  return [
    sprHomeX(sim.col) + (sprHomeX(sim.tcol) - sprHomeX(sim.col)) * ex,
    sprHomeY(sim.row) + (sprHomeY(sim.trow) - sprHomeY(sim.row)) * ey,
  ];
};
// Prefers carrying on the way it's already facing, so it paces the block rather
// than jittering on one key. Vertical hops are the minority so the walk still
// reads as a walk.
function sprAim(sim) {
  if (sim.rows < 2 || Math.random() < 0.72) {
    let c = sim.col + sim.dir;
    if (c < 0 || c >= sim.cols) { sim.dir *= -1; c = sim.col + sim.dir; }
    if (c >= 0 && c < sim.cols) { sim.tcol = c; sim.trow = sim.row; return true; }
  }
  const first = Math.random() < 0.5 ? 1 : -1;
  for (const d of [first, -first]) {
    const room = d < 0 ? sim.row : sim.rows - 1 - sim.row;   // floors available that way
    if (room < 1) continue;
    const opts = d < 0 ? SPR_UP : SPR_DOWN;
    sim.style = Math.random() < 0.58 ? opts[Math.floor(Math.random() * opts.length)] : null;
    // A ladder or a parachute is worth more than one floor — a long climb or a
    // long drift is most of the reason to have them. Plain hops stay single-floor,
    // and the landing is still a key either way.
    const span = sim.style && room > 1 && Math.random() < 0.45
      ? 1 + Math.floor(Math.random() * room) : 1;
    sim.trow = sim.row + d * span;
    sim.tcol = sim.col;
    // A slide runs diagonally when there's a column to land in — that's what
    // makes it read as a slide rather than as falling down a hole. The landing
    // is still a real key, so the rest-on-a-key invariant is untouched.
    if (sim.style === "slide") {
      const c = sim.col + sim.dir;
      if (c >= 0 && c < sim.cols) sim.tcol = c;
    }
    return true;
  }
  return false;
}

// The ladder / slide / balloon / parachute itself. Drawn before the sprite so he
// rides on top of it, and in canvas-relative Y so both keys the ride spans draw
// their own slice of it — the viewBox clips the rest.
function sprRideArt(sim, x, y0, sw, sh, ox, lr) {
  const s = sim.style;
  if (!s || sim.t === 0) return "";
  const homeY = (r) => sprHomeY(r) - lr * KEY;
  const yTop = Math.min(homeY(sim.row), homeY(sim.trow));
  const yBot = Math.max(homeY(sim.row), homeY(sim.trow)) + sh;
  const cxS = sprHomeX(sim.col) + sw / 2 - ox, cxT = sprHomeX(sim.tcol) + sw / 2 - ox;
  const F = (n) => n.toFixed(1);
  if (s === "ladder") {
    const w = 30;
    let out = `<rect x="${F(cxS - w / 2)}" y="${F(yTop - 10)}" width="4" height="${F(yBot - yTop + 10)}" fill="${C.track}"/>`
            + `<rect x="${F(cxS + w / 2 - 4)}" y="${F(yTop - 10)}" width="4" height="${F(yBot - yTop + 10)}" fill="${C.track}"/>`;
    for (let ry = yTop - 4; ry < yBot; ry += 15)
      out += `<rect x="${F(cxS - w / 2)}" y="${F(ry)}" width="${w}" height="4" fill="${C.track}"/>`;
    return out;
  }
  if (s === "slide") {
    const t1 = yTop + sh * 0.45, t2 = yBot - sh * 0.15;
    return `<polygon points="${F(cxS - 17)},${F(t1)} ${F(cxS + 17)},${F(t1)} ${F(cxT + 17)},${F(t2)} ${F(cxT - 17)},${F(t2)}" fill="${C.track}"/>`;
  }
  // Balloon and parachute ride with him rather than being fixed to the block.
  if (s === "balloon") return sprDraw(ACT_ART.balloon, x + sw / 2 - 12, y0 - 40, 6, 6, ox, C.bad);
  if (s === "chute") return sprDraw(ACT_ART.chute, x + sw / 2 - 54, y0 - 30, 9, 9, ox, C.ok);
  return "";
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
  balloon:[" ## ", "####", "####", " ## ", "  # ", " #  "],
  clawOpen:[" ##", "#  ", " ##"],
  clawShut:[" ##", "###", " ##"],
  // Wider than he is, or it reads as a hat rather than a canopy. Three rows
  // only: there are just ~32px of headroom above him inside a key.
  chute: ["  ########  ",
          "############",
          " #        # "],
};

// Changing floors is worth some theatre. A plain hop stays the most common way
// between rows — these fire a little over half the time, so they still register
// as a surprise rather than a routine. `up` picks which list a move draws from.
const SPR_STYLE = {
  ladder:  { up: true,  speed: 0.42, ease: (u) => u },                        // steady climb
  balloon: { up: true,  speed: 0.34, ease: (u) => 1 - (1 - u) * (1 - u) },    // floats, easing off
  slide:   { up: false, speed: 1.55, ease: (u) => u * u },                    // accelerates
  chute:   { up: false, speed: 0.48, ease: (u) => u },                        // drifts down
};
const SPR_UP = Object.keys(SPR_STYLE).filter((k) => SPR_STYLE[k].up);
const SPR_DOWN = Object.keys(SPR_STYLE).filter((k) => !SPR_STYLE[k].up);
// Ticks, at TILE_SPEC.scuttle.ms (140ms) each.
const SPR_PARTY_LEN = 22;   // ticks, ~3s at TILE_SPEC.scuttle.ms
const ACT_LEN = { ball: 40, bubble: 30, jump: 12, heart: 24, excl: 12, spin: 12, pinch: 20, dance: SPR_PARTY_LEN };
// dance is the triple-tap payoff, never a spontaneous bit of business.
const SPR_ACTS = Object.keys(ACT_LEN).filter((k) => k !== "dance");
const PARTY_COLORS = [C.accent, C.accentHi, C.ok, C.warn, C.bad, C.text];

// Every key in the block throws confetti and lets off a firework, wherever he
// happens to be standing — the whole point is that the block goes off, not his
// key. Positions come from laneHash so each piece keeps its own lane frame to
// frame instead of teleporting, the same reason the rain tile hashes its lanes.
function sprPartyArt(sim, lc, lr) {
  const k = SPR_PARTY_LEN - sim.party;   // ticks elapsed
  const seed = lc * 37 + lr * 101;
  let out = "";
  for (let i = 0; i < 16; i++) {
    const x = 4 + laneHash(seed + i, 1) * 132;
    const drop = 6 + laneHash(seed + i, 2) * 7;
    const y = ((k * drop + laneHash(seed + i, 3) * 160) % 176) - 16;
    const w = 4 + Math.floor(laneHash(seed + i, 4) * 4);
    const col = PARTY_COLORS[Math.floor(laneHash(seed + i, 5) * PARTY_COLORS.length)];
    out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${w + 2}" fill="${col}" transform="rotate(${(k * 17 + i * 53) % 360} ${(x + w / 2).toFixed(1)} ${(y + w / 2).toFixed(1)})"/>`;
  }
  // Two bursts per key, staggered off that key's own seed so the block crackles
  // instead of flashing in unison.
  for (let b = 0; b < 2; b++) {
    const bk = k - (Math.floor(laneHash(seed + b * 13, 6) * (SPR_PARTY_LEN - 10)) + b * 2);
    if (bk < 0 || bk > 8) continue;
    const cx = 24 + laneHash(seed + b, 7) * 96, cy = 24 + laneHash(seed + b, 8) * 84;
    const col = PARTY_COLORS[Math.floor(laneHash(seed + b, 9) * PARTY_COLORS.length)];
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      out += `<rect x="${(cx + Math.cos(ang) * bk * 8).toFixed(1)}" y="${(cy + Math.sin(ang) * bk * 8).toFixed(1)}" width="4" height="4" fill="${col}" opacity="${(1 - bk / 8).toFixed(2)}"/>`;
    }
  }
  return out;
}
const rollAct = () => 40 + Math.floor(Math.random() * 120);   // 5.6s–22s between bits
// How long he lingers on a key before moving on. Long enough to read as a stop
// rather than a bounce, and randomised so a block never settles into a rhythm.
const SPR_REST_MS = [2500, 4000];
const rollRest = () =>
  Math.round((SPR_REST_MS[0] + Math.random() * (SPR_REST_MS[1] - SPR_REST_MS[0])) / TILE_SPEC.scuttle.ms);

// Poking the key gets a rise out of him, picked at random so two presses don't
// do the same thing. `scuttleWake` keeps the tile animating for a few seconds
// afterwards — without it a press while Claude is idle would do nothing at all,
// because idleMs 0 has already stopped the frame pump.
const SPR_REACTS = ["pinch", "spin", "flee", "jump", "excl"];
let scuttleWake = 0;
let scuttleTaps = [];   // recent press times, for the triple-tap easter egg

const scuttleSim = (device) => {
  for (const [k, v] of sims) if (k.startsWith(`scuttle|${device}|`)) return v;
  return null;
};

function scuttleParty(sim) {
  if (sim.t > 0) { sim.col = sim.tcol; sim.row = sim.trow; sim.t = 0; sim.style = null; }
  sim.party = SPR_PARTY_LEN;
  sim.act = "dance";
  sim.actT = 0;
  sim.fast = 1;
}

function scuttleReact(sim) {
  // Always react from a standstill: mid-hop he is over a gap, and a reaction is
  // exactly the thing that would hold him there long enough to notice.
  if (sim.t > 0) { sim.col = sim.tcol; sim.row = sim.trow; sim.t = 0; sim.style = null; }
  sim.rest = 1;
  let r = SPR_REACTS[Math.floor(Math.random() * SPR_REACTS.length)];
  if (r === "flee" && sim.cols * sim.rows < 2) r = "spin";   // nowhere to bolt to
  if (r === "flee") {
    let c, rr, guard = 0;
    do {
      c = Math.floor(Math.random() * sim.cols);
      rr = Math.floor(Math.random() * sim.rows);
    } while (c === sim.col && rr === sim.row && ++guard < 24);
    sim.dir = c < sim.col ? -1 : 1;
    sim.tcol = c; sim.trow = rr; sim.style = null; sim.act = null;
    sim.fast = 2.8; sim.t = 1e-6;
    return "flee";
  }
  sim.act = r; sim.actT = 0;
  return r;
}

function scuttleStep(sim, busy) {
  // The same telemetry the rain tile reads: how fast it scuttles is the burn
  // rate, and more sessions working hurry it along.
  const burn = state.burn?.tokensHour ?? 0;
  sim.phase++;
  // The party outranks everything: he stays put and dances it out.
  if (sim.party > 0) {
    sim.party--;
    sim.actT++;
    if (!sim.party) { sim.act = null; sim.actNext = rollAct(); sim.rest = rollRest(); }
    return;
  }
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
    // Mid-hop: finish it. Faster when there's more work going through, and
    // scaled by the ride — a slide is over quickly, a climb is not.
    const rate = 0.10 + Math.min(0.09, burn / 1e8) + Math.min(0.03, busy * 0.006);
    // t always runs 0..1, so without dividing by the distance a three-floor
    // climb would cover three times the pixels in the same time.
    const span = Math.max(1, Math.abs(sim.trow - sim.row), Math.abs(sim.tcol - sim.col));
    sim.t = Math.min(1, sim.t + rate * (sim.style ? SPR_STYLE[sim.style].speed : 1) * sim.fast / span);
    if (sim.t >= 1) {
      sim.col = sim.tcol; sim.row = sim.trow; sim.t = 0; sim.style = null; sim.fast = 1;
      sim.rest = rollRest();
    }
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
  if (a === "pinch" || a === "dance") {
    // Claws up and snapping. In the headroom like everything else: a sprite can
    // be nearly key-width, so there is no dependable room at its sides.
    const c = k % 4 < 2 ? ACT_ART.clawOpen : ACT_ART.clawShut;
    return sprDraw(c, mid - 42, y0 - 24, 8, 8, ox, SPRITE.body)
         + sprDraw(sprFlip(c), mid + 18, y0 - 24, 8, 8, ox, SPRITE.body);
  }
  if (a === "heart") return sprDraw(ACT_ART.heart, mid - 15 + Math.sin(k * 0.25) * 4, y0 - 26 - k * 0.7, P, P, ox, C.bad);
  if (a === "excl") return sprDraw(ACT_ART.excl, mid - 6, y0 - 34 + (k < 3 ? (3 - k) * 6 : 0), P, P, ox, C.warn);
  return "";
}

function scuttleCellKey(lc, lr, cols, rows, t, sim, busy) {
  const ox = lc * KEY, sw = sprSW(), sh = sprSH();
  const walking = busy > 0 || Date.now() < scuttleWake;
  // He must never come to *rest* between keys. idleMs 0 freezes this tile
  // wherever it stands, and that frozen frame is what gets looked at for
  // minutes — so a mid-hop freeze doesn't read as crossing, it reads as living
  // in the gap. Land him on whichever key he was nearer. Idempotent, so running
  // it once per key in the group is harmless. The act goes too, or he freezes
  // mid-jump and sleeps in the air.
  if (!walking) {
    if (sim.t > 0.5) { sim.col = sim.tcol; sim.row = sim.trow; }
    sim.tcol = sim.col; sim.trow = sim.row; sim.t = 0; sim.act = null; sim.style = null;
    sim.party = 0;
  }
  const [xh, ry] = sprPos(sim);
  const moving = walking && !sim.act && sim.t > 0;
  const parked = walking && !sim.act && !moving;
  // Legs alternate while crossing. Parked, he shuffles a foot now and then and
  // breathes: he now waits 2.5–4s on each key, and without some sign of life
  // that long a pause reads as the tile having frozen rather than as standing.
  const stepping = moving ? sim.phase % 2 === 1 : parked && Math.floor(sim.phase / 3) % 9 === 0;
  const breathe = parked ? [0, 0, -1, -2, -2, -1, 0, 0][Math.floor(sim.phase / 5) % 8] : 0;
  // jump arcs the whole body; dance sways it side to side; spin and dance both
  // flip his facing on the spot.
  const dancing = sim.act === "dance";
  const x = xh + (dancing ? Math.round(Math.sin(sim.actT * 0.6) * 12) : 0);
  const hop = sim.act === "jump" ? -Math.round(Math.sin((sim.actT / ACT_LEN.jump) * Math.PI) * 24) : 0;
  const bob = (moving && stepping ? -2 : 0) + breathe;   // half-step lift, so it isn't gliding
  // Vertically anchored to the key row he's standing on — NOT centred on the
  // canvas, which is the same thing on a 1-row block and a seam-straddling bug
  // on every other shape.
  const y0 = ry + bob + hop - lr * KEY;
  let pose = !walking ? SPRITE.sleep : stepping ? SPRITE.walkB : SPRITE.walkA;
  let agent = SPRITE.agent;
  const facing = dancing ? (Math.floor(sim.actT / 3) % 2 ? -sim.dir : sim.dir)
    : sim.act === "spin" ? (sim.actT % 2 ? -sim.dir : sim.dir) : sim.dir;
  if (facing < 0) { pose = sprFlip(pose); agent = sprFlip(agent); }
  // Ride first, so he climbs the ladder rather than the ladder covering him.
  let out = walking ? sprRideArt(sim, x, y0, sw, sh, ox, lr) : "";
  out += sprDraw(pose, x, y0, sprPX(), sprPY(), ox);
  if (walking) out += sprActArt(sim, x, y0, sw, sh, ox);
  if (sim.party > 0) out += sprPartyArt(sim, lc, lr);
  // SDK agents trail behind in the smaller pose. pollSessions() already counts
  // them separately from the sessions the user can actually see.
  for (let i = 1; walking && i <= Math.min(3, state.agents ?? 0); i++) {
    // Even cell sizes only: quarter cells are drawn at half a cell, and an odd
    // size rounds that half down into a seam.
    const ax = x - sim.dir * (sw * 0.5 + i * 40);
    out += sprDraw(agent, ax, y0 + sprPY() * 2, 8, 12, ox);
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
    s = { col: 0, row: rows - 1, tcol: 0, trow: rows - 1, t: 0, rest: 1, dir: 1, style: null, fast: 1, party: 0,
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
// Detached fire-and-forget: each of these opens something we never wait on.
function launch(cmd, args, context) {
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.on("error", () => showAlert(context));
  child.unref();
  showOk(context);
}

// AppleScript goes in on stdin with `on run argv`, never built by concatenation.
// Interpolating a path into a script is the "Escape from AppleScript" injection
// class: a directory named `foo"bar` closes the literal and executes. Passing it
// as an argument removes that layer, and `quoted form of` handles the shell layer
// underneath.
function osa(script, args, cb) {
  const p = spawn("osascript", ["-", ...args], { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => { err += String(d); });
  p.on("error", (e) => cb?.(e));
  p.on("close", (code) => cb?.(code === 0 ? null : new Error(err.trim() || `osascript exit ${code}`)));
  p.stdin.end(script);
}

function launchDesktop(context) {
  // `open -b` survives an install into ~/Applications and an app rename, which
  // `open -a "Claude"` does not. The exit code is open's own, not the app's — 0
  // means "launch request accepted", not "installed".
  if (IS_MAC) return launch("open", ["-b", MAC_CLAUDE_BUNDLE], context);
  return launch("explorer.exe", [desktopAppId], context);
}

function quickChat(context) {
  // macOS uses Anthropic's documented claude:// scheme rather than synthesised
  // keystrokes, and it is strictly better: no Accessibility grant, no clipboard
  // to trample, and it launches the app if it isn't running. Synthesis is a dead
  // end there anyway — the Mac quick-entry default is a double-tap of Option,
  // which can't be cleanly synthesised, and WindowServer can refuse synthetic
  // events to Carbon-registered global hotkeys regardless. It opens a normal
  // chat window; there is no documented URL for the quick-entry overlay.
  if (IS_MAC) return launch("open", ["claude://claude.ai/new"], context);
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
  return openUrl("https://claude.ai/new", context);
}

// Both `open` and `start` hand an arbitrary scheme to whatever the OS registered
// for it, and a leading "-" is read as an option. Parsing the URL and insisting
// on http(s) closes both, and costs nothing.
function openUrl(url, context) {
  let u;
  try { u = new URL(url); } catch { return showAlert(context); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return showAlert(context);
  if (IS_MAC) return launch("open", [u.href], context);
  return launch("cmd.exe", ["/c", "start", "", u.href], context);
}

function openTerminalAt(dir, context) {
  if (IS_MAC) {
    // `do script` is literally "type this into the shell", so a stray newline in
    // the path executes a second command even with perfect quoting — strip them
    // before they reach AppleScript.
    const clean = String(dir).replace(/[\r\n]/g, "");
    const iterm = ["/Applications/iTerm.app", path.join(os.homedir(), "Applications/iTerm.app")]
      .some((a) => fs.existsSync(a));
    // Addressed by bundle id, since the app is variously "iTerm" and "iTerm2".
    const script = iterm ? `
on run argv
  set d to quoted form of (item 1 of argv)
  tell application id "com.googlecode.iterm2"
    activate
    set w to (create window with default profile)
    tell current session of w to write text ("cd " & d & " && claude")
  end tell
end run` : `
on run argv
  set d to quoted form of (item 1 of argv)
  tell application "Terminal"
    set wasRunning to running
    activate
    -- A cold launch already opens a window; targeting it avoids a second one.
    if wasRunning then
      do script ("cd " & d & " && claude")
    else
      do script ("cd " & d & " && claude") in front window
    end if
  end tell
end run`;
    return osa(script, [clean], (err) => { if (err) { log("terminal failed:", String(err)); showAlert(context); } else showOk(context); });
  }
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
// macOS matches on the session's controlling terminal rather than on the window
// title. The pid in the session file belongs to the `claude` process, not to the
// terminal app, so "frontmost of process whose unix id is pid" would never match
// — and it raises a whole app anyway, not a window.
//
// iTerm2 exposes `tty` as a documented session property, so the right tab can be
// selected exactly. Terminal.app does not document it (`tty of tab` is
// unverified), so it only gets activated: the app comes forward, the specific
// tab may not. Honest partial beats a confident wrong AppleScript.
function focusWindowMac(s, context) {
  if (!s?.pid) return showAlert(context);
  execFile("ps", ["-o", "tty=", "-p", String(s.pid)], { timeout: 3000 }, (err, out) => {
    const tty = String(out ?? "").trim();
    const iterm = ["/Applications/iTerm.app", path.join(os.homedir(), "Applications/iTerm.app")]
      .some((a2) => fs.existsSync(a2));
    if (err || !tty || tty === "??" || !iterm) {
      // Nothing to match on, or not iTerm: bring the terminal app forward.
      return launch("open", ["-b", iterm ? "com.googlecode.iterm2" : "com.apple.Terminal"], context);
    }
    const script = `
on run argv
  set want to "/dev/" & (item 1 of argv)
  tell application id "com.googlecode.iterm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with sess in sessions of t
          if (tty of sess) is want then
            activate
            select w
            tell w to select t
            tell t to select sess
            return "ok"
          end if
        end repeat
      end repeat
    end repeat
  end tell
  error "no session on " & want
end run`;
    osa(script, [tty], (e2) => (e2 ? showAlert(context) : showOk(context)));
  });
}

function focusWindow(s, context) {
  if (IS_MAC) return focusWindowMac(s, context);
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
  // Same scheme, with the prompt as a query parameter — which also means macOS
  // never overwrites the clipboard the way the Windows path has to. `q` is
  // truncated by Claude around 14k characters. `enter` has no equivalent: the
  // URL opens the chat with the text present, it does not submit it.
  if (IS_MAC) {
    const q = encodeURIComponent(String(text).slice(0, 14000));
    return launch("open", [`claude://claude.ai/new?q=${q}`], context);
  }
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

// Arbitrary code execution by design — the same shape as `cmd /c start`. That is
// acceptable while the string only ever arrives from the local property
// inspector; treat the settings store as a trust boundary if that ever changes
// (an imported or synced profile carrying a command would be a full RCE).
function runCustom(command, context) {
  if (IS_MAC) {
    // The command is code, not data, so it is deliberately not quoted here.
    return osa(`
on run argv
  tell application "Terminal"
    activate
    do script (item 1 of argv)
  end tell
end run`, [String(command)], (err) => (err ? showAlert(context) : showOk(context)));
  }
  return launch("cmd.exe", ["/c", "start", "", command], context);
}

function onKeyDown(context, kind, device) {
  switch (kind) {
    case "activity": case "term": case "life": case "history": case "pipes":
      tilesPaused = !tilesPaused;   // a big animated block is worth being able to mute
      for (const k of TILE_KINDS) renderTiles(k, false);
      return showOk(context);
    // Scuttle spends its press on a reaction rather than a pause — a single
    // small creature isn't the thing you need to mute, and poking it is the
    // whole appeal.
    case "scuttle": {
      const sim = scuttleSim(device ?? views.get(context)?.device);
      if (!sim) return showAlert(context);
      const now = Date.now();
      scuttleWake = now + 8000;   // comfortably outlasts the 3s party
      // Three pokes in quick succession is the easter egg. Taps older than the
      // window are dropped rather than counted, so three presses spread over a
      // minute stay three ordinary pokes.
      scuttleTaps = scuttleTaps.filter((t) => now - t < 1600);
      scuttleTaps.push(now);
      if (scuttleTaps.length >= 3) {
        scuttleTaps = [];
        scuttleParty(sim);
        log("scuttle: triple tap -> party");
      } else {
        log(`scuttle: poked -> ${scuttleReact(sim)}`);
      }
      // The reaction *is* the acknowledgement (showOk is a global no-op — see
      // its definition). showAlert above stays, because a press that found no
      // sim has nothing else to show for itself.
      return renderTiles("scuttle", false);   // respond on this frame, not the next tick
    }
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
      pollUsage("user");   // the bucket decides whether a request is affordable
      return showOk(context);
    case "today":
      pollToday();
      return showOk(context);
    case "clock": case "lifetime":
      pollStats();
      return showOk(context);
    case "task":
      pollTasks();
      return showOk(context);
    case "attention": {
      const a = state.attention;
      if (!a) return showOk(context);
      // Pressing it should take you to the thing that needs you, not merely
      // silence the alert. Cleared either way so the key can't get stuck lit.
      const sess = state.sessions.find((x) => x.name === a.name) ??
                   state.sessions.find((x) => x.cwd && x.cwd === a.cwd);
      state.attention = null;
      renderAll(["attention"]);
      if (sess) return focusWindow(sess, context);
      return showOk(context);
    }
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
      pollUsage("user");   // the bucket decides whether a request is affordable
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
    await pollUsage("user");
    log("selftest usage:", state.usage ? JSON.stringify(state.usage) : `ERROR: ${state.usageErr}`);
    await pollSessions();
    log(`selftest sessions (${state.sessions.length} shown, ${state.agents} sdk agents hidden):`,
      state.sessions.map((s) => `${s.name}[${s.status}]`).join(", ") || "(none)");
    await pollToday();
    log("selftest today:", JSON.stringify(state.today));
    await pollBurn();
    log("selftest burn:", JSON.stringify(state.burn), "eta:", sessionEta());
    // RECOVERY TIME is what decides whether the gauge looks stale, so assert it
    // here rather than discovering it on the deck again. Two earlier attempts
    // regressed exactly here: a doubling backoff gave 8-minute holes, and a
    // token bucket with a 2-token reserve gave 4-minute ones.
    const [savedEvery, savedAttempt] = [pollEvery, lastUsageAttempt];
    log("selftest poll cadence:");
    pollEvery = POLL_MIN; lastUsageAttempt = Date.now();
    log(`  ${"baseline".padEnd(30)} -> ${Math.round(nextUsageDelay() / 1000)}s (81% served; tracks well)`);
    pollEvery = Math.min(pollEvery + 20_000, POLL_MAX);
    log(`  ${"gap after ONE 429".padEnd(30)} -> ${Math.round(nextUsageDelay() / 1000)}s (must stay well under 240s)`);
    for (let i = 0; i < 20; i++) pollEvery = Math.min(pollEvery + 20_000, POLL_MAX);
    log(`  ${"20 straight 429s converge to".padEnd(30)} -> ${pollEvery / 1000}s (cap ${POLL_MAX / 1000}s)`);
    let decayed = 0;
    while (pollEvery > POLL_MIN && decayed < 100) { pollEvery = Math.max(POLL_MIN, pollEvery - 10_000); decayed++; }
    log(`  ${"clean polls back to baseline".padEnd(30)} -> ${decayed} (${pollEvery / 1000}s)`);
    // A mashed key, or the 600ms expired-window ticker, must not stack requests.
    lastUsageAttempt = Date.now();
    let extra = 0;
    for (let i = 0; i < 100; i++) if (Date.now() - lastUsageAttempt >= USER_SPACING) extra++;
    log(`  ${"100 rapid presses spend".padEnd(30)} -> ${extra} extra requests`);
    [pollEvery, lastUsageAttempt] = [savedEvery, savedAttempt];

    // The post-reboot path. A dead token must not be resent (that is what earns
    // the 429 that blanks the gauges), and an auth wait must not inherit a
    // leftover 429 interval.
    const [savedBackoff, savedWait] = [usageBackoff, authWait];
    log("selftest auth handling:");
    usageBackoff = POLL_MAX; authWait = true;
    log(`  ${"auth wait beats 429 backoff".padEnd(30)} -> ${nextUsageDelay() / 1000}s`);
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
    
    for (const [cols, rows] of [[1, 1], [4, 1], [2, 2], [3, 2], [8, 4]]) {
      const sim = simFor("scuttle", `selftest|scuttle|${cols}x${rows}`, cols, rows);
      const seen = new Set();
      let bad = 0;
      for (let i = 0; i < 6000; i++) {
        scuttleStep(sim, 2);
        if (sim.t !== 0) continue;               // mid-hop is allowed to straddle
        const [x, y] = sprPos(sim);
        if (x < sim.col * KEY || x + sprSW() > (sim.col + 1) * KEY ||
            y < sim.row * KEY || y + sprSH() > (sim.row + 1) * KEY) bad++;
        seen.add(`${sim.col},${sim.row}`);
      }
      log(`  ${`${cols}x${rows}`.padEnd(5)} ${bad ? `OFF-KEY ${bad}x` : "always on a key"}, reached ${seen.size}/${cols * rows} keys`);
    }

    await pollTasks();
    log("selftest tasks:", state.tasks
      ? `${state.tasks.name}: ${state.tasks.done}/${state.tasks.total} — ${state.tasks.activeForm ?? state.tasks.subject ?? "(none active)"}`
      : "(no live session has a task list)");

    await pollStats();
    const st = state.stats;
    if (!st) log("selftest stats: ERROR:", state.statsErr);
    else {
      const lag = st.computedAt ? Math.round((Date.now() - new Date(st.computedAt).getTime()) / 864e5) : "?";
      log(`selftest stats: ${st.days.length}d history, ${st.totalSessions} sessions, ` +
          `${fmtNum(st.totalMessages)} msgs, ${fmtNum(st.toolCalls)} tool calls, computed ${lag}d ago`);
      const peak = st.hours.indexOf(Math.max(...st.hours));
      log(`  busiest hour ${peak}:00; top model ${st.models[0]?.id ?? "?"} at ${fmtNum(st.models[0]?.tokens)} tok`);
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
    const label = (x, y, s) => `<text x="${x}" y="${y}" font-family="${UI}" font-size="19" fill="#9b96a8">${s}</text>`;
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
      // Same problem for the between-row rides: `--style ladder` sets up the
      // move and lets the strip watch it play out.
      const forceStyle = argOf("--style");
      if (forceStyle && SPR_STYLE[forceStyle]) {
        const up = SPR_STYLE[forceStyle].up;
        sim.row = up ? rows - 1 : 0;
        sim.trow = up ? Math.max(0, rows - 2) : Math.min(rows - 1, 1);
        sim.col = sim.tcol = 0;
        if (forceStyle === "slide" && cols > 1) sim.tcol = 1;
        sim.style = forceStyle;
        sim.t = 0.001;
        sim.actNext = 1e9;   // don't let a random bit of business interrupt it
      }
      // `--party` sets off the triple-tap easter egg so it can be looked at
      // without pressing a physical key three times.
      if (process.argv.includes("--party")) { sim.party = SPR_PARTY_LEN; sim.act = "dance"; sim.actT = 0; }
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
    } else if (process.argv.includes("--keys")) {
      // The tile and chart previews cover the animated surfaces; this covers the
      // static ones, which otherwise can't be looked at without a physical deck.
      // `npm run preview -- --keys --out keys.svg`
      await Promise.all([pollStats(), pollToday(), pollBurn(), pollSessions().then(pollTasks)]);
      const st = state.stats;
      const cells = [
        ["session", gaugeKey("SESSION 5H", state.usage?.fiveHour?.pct ?? 42, "2h 10m left")],
        ["weekly", gaugeKey("WEEKLY", state.usage?.weekly?.pct ?? 63, "Fable 24%")],
        ["today", linesKey("TODAY", [
          { text: `${state.today?.chats ?? "--"} chats`, color: C.text },
          { text: `${fmtNum(state.today?.msgs)} msgs`, color: C.text },
          { text: `${fmtNum(state.today?.tokens)} tok`, color: C.accent }])],
        ["burn", burnKey(state.burn?.tokensHour ?? null, sessionEta())],
        ["task", taskKey(state.tasks)],
        ["rhythm", st ? clockKey(st.hours, new Date().getHours()) : null],
        ["lifetime", st ? linesKey("LIFETIME", [
          { text: `${fmtNum(st.totalMessages)} msgs`, color: C.text },
          { text: `${fmtNum(st.toolCalls)} tools`, color: C.text },
          { text: `${st.totalSessions} sessions`, color: C.accent }], C.accent,
          st.firstAt ? new Date(st.firstAt).toLocaleDateString([], { month: "short", day: "numeric" }) : null) : null],
      ].filter(([, img]) => img);
      cells.forEach(([lbl, img], i) => {
        inner += place(img, i * PITCH, 40);
        inner += label(i * PITCH, 28, lbl);
      });
      w = cells.length * PITCH; h = 40 + KEY;
      log(`keys preview: ${cells.map(([l]) => l).join(", ")}`);
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
    if (Date.now() - state.usageAt > 90_000) pollUsage("user");
    pollSessions().then(pollTasks);
    pollToday();
    pollStats();
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
        controller: msg.payload?.controller ?? "Keypad",
      });
      setTitle(context);
      // The chart profile appearing is the signal that the user just opened it
      if ((kind === "chart-cell" || kind === "chart-open") && Date.now() - lastWeekPoll > 15_000) pollWeek();
      render(context, kind);
    } else if (event === "willDisappear") {
      views.delete(context);
      dialIdx.delete(context);
      cycle.delete(context);
      focusIdx.delete(context);
    } else if (event === "didReceiveSettings" && action) {
      const v = views.get(context);
      if (v) { v.settings = msg.payload?.settings ?? {}; render(context, v.kind); }
    } else if (event === "sendToPlugin" && action) {
      if (msg.payload?.cmd === "getModels") {
        send({ event: "sendToPropertyInspector", context, payload: { models: (state.usage?.models ?? []).map((m) => m.name) } });
      }
    } else if (event === "dialRotate") {
      const n = DIAL_METRICS.length;
      const step = (msg.payload?.ticks ?? 0) >= 0 ? 1 : -1;
      dialIdx.set(context, (((dialIdx.get(context) ?? 0) + step) % n + n) % n);
      renderDial(context);
    } else if (event === "dialDown" || event === "touchTap") {
      pollUsage("user"); pollBurn(); pollToday();
      renderDial(context);
    } else if (event === "keyDown" && action) {
      onKeyDown(context, kindOf(action), msg.device ?? views.get(context)?.device);
    }
  });

  (function usageLoop() { setTimeout(async () => { await pollUsage(); usageLoop(); }, nextUsageDelay()); })();
  setInterval(async () => { await pollSessions(); await pollTasks(); }, 5_000);
  setInterval(pollToday, 300_000);
  setInterval(pollStats, 600_000);   // stats-cache is rewritten rarely
  startHookServer();
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
      // A poke wakes Scuttle even with nothing running. Without this the frame
      // pump has already stopped by the time the press arrives, so reacting
      // would be invisible — which is most of the time you'd want to poke it.
      const live = active || (kind === "scuttle" && now < scuttleWake);
      const interval = live ? TILE_SPEC[kind].ms : TILE_SPEC[kind].idleMs;
      if (!interval) {
        if (tileRunning.has(kind)) { tileRunning.delete(kind); renderTiles(kind, false); }
        continue;
      }
      if (now - (tileLast.get(kind) ?? 0) < interval) continue;
      tileLast.set(kind, now);
      tileRunning.add(kind);
      renderTiles(kind, live);
    }
  }, 60);
  // Animation ticker: busy-session dots + red pulse on gauges at 90%+
  setInterval(() => {
    animPhase = (animPhase + 1) % 3;
    const kinds = [];
    if (state.sessions.some((s) => s.status && s.status !== "idle")) kinds.push("sessions");
    if (state.attention) kinds.push("attention");
    if (state.usage?.fiveHour?.pct >= 90) kinds.push("usage-session");
    if (state.usage?.weekly?.pct >= 90) kinds.push("usage-weekly");
    if ((state.usage?.models ?? []).some((m) => m.pct >= 90)) kinds.push("usage-model");
    if (kinds.length && [...views.values()].some((v) => kinds.includes(v.kind))) renderAll(kinds);
    // Safety net: a reset time has passed but we still show pre-reset data
    // (missed timer / resume from sleep). This used to fire every 30s, which at
    // 100% with a passed reset was a steady 429 generator. It stays ROUTINE
    // priority deliberately — it runs on a 600ms ticker, so giving it the
    // reserve would let it drain the whole burst in a couple of seconds. As a
    // routine poll it simply retries at the refill until the window flips.
    const expired = [state.usage?.fiveHour, state.usage?.weekly]
      .some((b) => b?.resetsAt && Date.now() - new Date(b.resetsAt).getTime() > 5000);
    if (expired && !state.usageErr) pollUsage();
  }, 600);
  // Keep countdowns ("1h 5m left") fresh between polls
  setInterval(() => renderAll(["usage-session", "usage-weekly", "usage-model", "burn-rate", "attention"]), 30_000);
}
