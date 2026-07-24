// Generates "Claude 7-Day Chart.streamDeckProfile" — the profile the chart key
// switches the deck to. It is 32 identical chart-cell instances filling a Stream
// Deck XL; the plugin works out what each key should draw from its coordinates,
// so nothing about the layout is baked into this file.
//
// A .streamDeckProfile is a zip. Everything here is written stored (no deflate)
// with fixed timestamps so regenerating produces a byte-identical file when the
// layout hasn't changed — otherwise every build would show up as a diff.
//
// Run: npm run profile   (also runs as part of npm run build)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PLUGIN_DIR = path.join(ROOT, "com.technicallybrantley.claude-deck.sdPlugin");
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf8"));

const PROFILE_NAME = "Claude 7-Day Chart";
const PLUGIN_UUID = "com.technicallybrantley.claude-deck";
const CELL_UUID = `${PLUGIN_UUID}.chart-cell`;
const XL_MODEL = "20GAT9901";
const COLS = 8, ROWS = 4;

// Fixed ids: regenerating must update the existing profile, not install a second
// copy alongside it. Page folders are UPPERCASE and the manifest refers to them
// in lowercase — that asymmetry is what Stream Deck itself writes, and it logs
// "failed to map default page" if the root manifest has no Default page that is
// absent from the Pages array.
const PROFILE_ID = "B7C1D0E2-5A34-4F68-9C21-3E7A4D905F11";
const PAGE_ID = "9F42A8C3-61B7-4D05-8E93-2C6B1F740AA8";
const DEFAULT_PAGE_ID = "3D18E5B6-72C4-4A19-B0F7-8D5E2971C34B";

// ---------- minimal store-only zip writer ----------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

const DOS_DATE = 0x5021, DOS_TIME = 0; // 2020-01-01 00:00 — constant, for reproducibility

function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const data = e.data ?? Buffer.alloc(0);
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);            // version needed
    h.writeUInt16LE(0, 8);             // method 0 = stored
    h.writeUInt16LE(DOS_TIME, 10);
    h.writeUInt16LE(DOS_DATE, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);  // compressed
    h.writeUInt32LE(data.length, 22);  // uncompressed
    h.writeUInt16LE(name.length, 26);
    local.push(h, name, data);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);            // version made by
    c.writeUInt16LE(20, 6);            // version needed
    c.writeUInt16LE(0, 10);            // method 0 = stored
    c.writeUInt16LE(DOS_TIME, 12);
    c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(e.data ? 0 : 0x10, 38); // external attrs: directory bit
    c.writeUInt32LE(offset, 42);
    central.push(c, name);

    offset += h.length + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

// ---------- profile contents ----------
const actions = {};
for (let col = 0; col < COLS; col++) {
  for (let row = 0; row < ROWS; row++) {
    const i = col * ROWS + row;
    actions[`${col},${row}`] = {
      ActionID: `7d3cce11-0000-4000-8000-${String(i).padStart(12, "0")}`,
      LinkedTitle: false,
      Name: "7-Day Chart Cell",
      Plugin: { Name: manifest.Name, UUID: PLUGIN_UUID, Version: manifest.Version },
      Resources: null,
      Settings: {},
      State: 0,
      States: [{
        FontFamily: "", FontSize: 12, FontStyle: "", FontUnderline: false,
        OutlineThickness: 2, ShowTitle: false, TitleAlignment: "bottom", TitleColor: "#ffffff",
      }],
      UUID: CELL_UUID,
    };
  }
}

const j = (o) => Buffer.from(JSON.stringify(o), "utf8");
const root = `${PROFILE_ID}.sdProfile`;
const entries = [
  { name: `${root}/Images/` },
  { name: `${root}/Profiles/` },
  {
    name: `${root}/manifest.json`,
    data: j({
      Device: { Model: XL_MODEL, UUID: "" },
      InstalledByPluginUUID: PLUGIN_UUID,
      Name: PROFILE_NAME,
      Pages: {
        Current: PAGE_ID.toLowerCase(),
        Default: DEFAULT_PAGE_ID.toLowerCase(),
        Pages: [PAGE_ID.toLowerCase()],
      },
      Version: "3.0",
    }),
  },
  { name: `${root}/Profiles/${DEFAULT_PAGE_ID}/Images/` },
  { name: `${root}/Profiles/${DEFAULT_PAGE_ID}/manifest.json`, data: j({ Controllers: [{ Actions: {}, Type: "Keypad" }], Icon: "", Name: "" }) },
  { name: `${root}/Profiles/${PAGE_ID}/Images/` },
  { name: `${root}/Profiles/${PAGE_ID}/manifest.json`, data: j({ Controllers: [{ Actions: actions, Type: "Keypad" }], Icon: "", Name: "" }) },
];

const out = path.join(PLUGIN_DIR, `${PROFILE_NAME}.streamDeckProfile`);
fs.writeFileSync(out, zip(entries));
console.log(`wrote ${path.relative(ROOT, out)} (${COLS * ROWS} keys, ${fs.statSync(out).size} bytes)`);
