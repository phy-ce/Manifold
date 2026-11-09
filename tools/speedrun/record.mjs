// Films the speedrun bot playing the game on the dev server, in a headless Chrome, and saves the frames.
// Usage: node tools/speedrun/record.mjs <out-dir> [chrome-path]
// Needs the dev server on http://localhost:5173 and tools/speedrun/<bot>.js (SPEEDRUN_BOT, default bot; SPEEDRUN_LANG, default ko). Writes frames/*.jpg and
// frames.txt (an ffmpeg concat list with each frame's real duration) into <out-dir>, then turn them into a
// video with ffmpeg. Nothing but Node itself: Chrome is driven through its DevTools protocol.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(process.argv[2] ?? "speedrun-out");
const chrome = process.argv[3] ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const VIEW = { width: 1600, height: 1000 };
const frames = join(out, "frames");
/** A run that takes longer than this is stuck; it is stopped and what was filmed is kept. */
const LIMIT_MS = 40 * 60 * 1000;
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

// The game asks for a language first; this page answers it and goes on to a fresh game.
const starter = join(root, "speedrun-start.html");
writeFileSync(starter, `<!doctype html><script>sessionStorage.setItem("modpack-simulator-restart","1");sessionStorage.setItem("modpack-simulator-language","${process.env.SPEEDRUN_LANG ?? "ko"}");localStorage.clear();location.replace("/");</script>`);

const browser = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(out, "profile")}`,
  `--window-size=${VIEW.width},${VIEW.height}`, "--hide-scrollbars", "--mute-audio", "--no-first-run", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let page = null;
for (let i = 0; i < 50 && !page; i += 1) {
  await sleep(200);
  try {
    page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page");
  } catch {
    // Chrome is still starting.
  }
}
if (!page) throw new Error("Chrome did not start");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ready) => socket.addEventListener("open", ready));
let nextId = 1;
const waiting = new Map();
const send = (method, params = {}) => new Promise((done, fail) => {
  const id = nextId++;
  waiting.set(id, { done, fail });
  socket.send(JSON.stringify({ id, method, params }));
});

const shots = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && waiting.has(message.id)) {
    const { done, fail } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) fail(new Error(message.error.message));
    else done(message.result);
    return;
  }
  if (message.method === "Page.screencastFrame") {
    const { data, metadata, sessionId } = message.params;
    const file = `f${String(shots.length).padStart(6, "0")}.jpg`;
    writeFileSync(join(frames, file), Buffer.from(data, "base64"));
    shots.push({ file, at: metadata.timestamp });
    socket.send(JSON.stringify({ id: nextId++, method: "Page.screencastFrameAck", params: { sessionId } }));
  }
});

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:5173/speedrun-start.html" });

const evaluate = async (expression, awaitPromise = false) =>
  (await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true })).result?.value;
for (let i = 0; i < 100 && !(await evaluate("!!window.__manifold && !!document.querySelector('.node')")); i += 1) await sleep(200);
rmSync(starter, { force: true });

await send("Page.startScreencast", { format: "jpeg", quality: 75, everyNthFrame: 1 });
const started = Date.now();
const progress = setInterval(async () => {
  const where = await evaluate("window.__speedrun").catch(() => "?");
  console.log(`${Math.round((Date.now() - started) / 1000)}s ${where} (${shots.length} frames)`);
}, 15000);

const bot = readFileSync(join(root, `tools/speedrun/${process.env.SPEEDRUN_BOT ?? "bot"}.js`), "utf8").replace(/^\s*\/\/.*$/gm, "");
let result;
try {
  result = await Promise.race([
    send("Runtime.evaluate", { expression: `(${bot.trim()})()`, awaitPromise: true, returnByValue: true }),
    sleep(LIMIT_MS).then(async () => ({ result: { value: `timed out at: ${await evaluate("window.__speedrun")}` } })),
  ]);
} finally {
  clearInterval(progress);
  await send("Page.stopScreencast").catch(() => {});
}
console.log("bot:", JSON.stringify(result.exceptionDetails?.exception?.description ?? result.result?.value));

// A bot may mark the stretches worth keeping in window.__keep, as [start, end] pairs in Date.now() seconds;
// then the film is those stretches only, cut together. Each frame lasts until the next one or its stretch's end.
const keep = (await evaluate("window.__keep").catch(() => null)) ?? [[-Infinity, Infinity]];
const list = [];
let total = 0;
for (const [from, to] of keep) {
  const inside = shots.filter((shot) => shot.at >= from && shot.at < to);
  inside.forEach((shot, i) => {
    const length = Math.min(inside[i + 1]?.at ?? shot.at + 1, to) - shot.at;
    total += length;
    list.push(`file 'frames/${shot.file}'\nduration ${length.toFixed(3)}`);
  });
}
list.push(list.at(-1).split("\n")[0]);
writeFileSync(join(out, "frames.txt"), list.join("\n"));
console.log(`${shots.length} frames, ${keep.length} stretches, ${Math.round(total)}s kept, list in ${join(out, "frames.txt")}`);
socket.close();
browser.kill();
if (existsSync(starter)) rmSync(starter, { force: true });
process.exit(0);
