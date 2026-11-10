// Builds the biome backdrops: each painted source in tools/scenery/source/<biome>.png is turned into coloured
// ASCII by asciify.html in a headless browser and saved as public/scenery/<biome>.png, which the game shows as is.
// Usage: node tools/scenery/build.mjs [biome ...]   (no names: every source there is)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const sources = join(here, "source");
const out = join(root, "public", "scenery");
/** The finished picture's size and the height of one ASCII cell, in px. */
const W = 1920, H = 1080, CELL = 7;

/** A Chromium browser to render with: Edge on Windows, else Chrome or Chromium on the PATH. */
function browser() {
  const candidates = [
    process.env.BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium", "/usr/bin/google-chrome",
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error("No Chromium browser found; set BROWSER to one.");
  return found;
}

/** WebP quality: glyph edges stay crisp at this level and a picture weighs about a third of the PNG. */
const QUALITY = 82;

/** Encodes a finished PNG as the WebP the game loads, with ffmpeg. */
function toWebp(png, biome) {
  const target = join(out, `${biome}.webp`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-c:v", "libwebp", "-quality", String(QUALITY), target], { stdio: "inherit" });
  return target;
}

mkdirSync(out, { recursive: true });
const wanted = process.argv.slice(2);
const pick = (b) => !wanted.length || wanted.includes(b);
const exe = browser();
// Painted sources: turned into ASCII first.
for (const biome of readdirSync(sources).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).filter(pick)) {
  const work = mkdtempSync(join(tmpdir(), "scenery-"));
  const page = `${pathToFileURL(join(here, "asciify.html")).href}?src=source/${biome}.png&w=${W}&h=${H}&cell=${CELL}`;
  const png = join(work, `${biome}.png`);
  execFileSync(exe, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--user-data-dir=${join(work, "profile")}`, `--window-size=${W},${H}`, "--virtual-time-budget=6000",
    `--screenshot=${png}`, page,
  ], { stdio: "ignore", timeout: 120000 });
  console.log(`${biome}: ${toWebp(png, biome)}`);
  rmSync(work, { recursive: true, force: true });
}
// Pictures already in ASCII (the desert was drawn that way from the start): only encoded.
const ready = join(here, "ascii");
if (existsSync(ready)) {
  for (const f of readdirSync(ready).filter((f) => f.endsWith(".png") && pick(f.slice(0, -4)))) {
    console.log(`${f.slice(0, -4)}: ${toWebp(join(ready, f), f.slice(0, -4))}`);
  }
}
