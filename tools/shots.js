// Captures the 4 dossier screenshots (?shot=chase|street|mission|title) at
// 1280x800 and writes them into repo screenshots/ as JPEGs, each <= 256 KiB.
// Usage: node tools/shots.js
// Requires: chrome-headless-shell (ms-playwright cache) + Python PIL for JPEG.
//
// Robustness (learned from three failed runs):
//  - One chrome for all 4 shots does NOT work: after a heavy scene, the next
//    page's JS often has not booted even 15s after navigate (state NO AZURA;
//    street/title captures came out byte-identical pre-boot frames), and the
//    debugger session can detach across navigations ("Not attached to an
//    active page"). A FRESH chrome per shot boots reliably (proven by probe:
//    street from a fresh chrome was state=play at 15s).
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const OUT = join(REPO, 'screenshots');
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const SHOTS = ['chase', 'street', 'mission', 'title'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let exitCode = 0;
for (let s = 0; s < SHOTS.length; s++) {
  const name = SHOTS[s];
  const PORT = 9230 + s;
  console.log('--- shot: ' + name + ' ---');
  const chrome = spawn(CHROME, [
    '--remote-debugging-port=' + PORT, '--no-sandbox', '--disable-dev-shm-usage',
    '--window-size=1280,800', '--disable-frame-rate-limit', '--run-all-compositor-stages-before-draw', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--hide-scrollbars', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', () => {});
  let ws = null;
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, { resolve, reject });
    try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { pending.delete(i); reject(e); return; }
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('timeout ' + method)); } }, 120000);
  });
  async function connect() {
    const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); } };
    await send('Runtime.enable');
    await send('Page.enable');
  }
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${PORT}/json/version`)).ok; } catch {} if (!up) await sleep(500); }
    if (!up) throw new Error('chrome did not start');
    await connect();
    await send('Page.navigate', { url: `http://localhost:8080/?shot=${name}&playtest=1` });
    await sleep(15000); // let the scene boot + settle (SwiftShader is slow)
    // Best-effort boot check, never fatal: log the state if we can read it.
    try {
      const m = await send('Runtime.evaluate', { expression: `window.__azura ? window.__azura.state : 'NO AZURA'`, returnByValue: true });
      console.log('state:', m.result && m.result.result ? m.result.result.value : 'unreadable');
    } catch (e) { console.log('state check skipped:', e.message); }
    let shot = null;
    for (let attempt = 0; attempt < 2 && !shot; attempt++) {
      try {
        const res = await send('Page.captureScreenshot', { format: 'png' });
        if (res && res.result && res.result.data) shot = res;
        else console.log(`capture attempt ${attempt + 1} failed:`, res && res.error ? JSON.stringify(res.error) : 'no result data');
      } catch (e) { console.log(`capture attempt ${attempt + 1} threw:`, e.message); }
      if (!shot) await sleep(3000);
    }
    if (!shot) throw new Error(`captureScreenshot failed for shot ${name}`);
    const pngPath = join(OUT, `shot-${name}.png`);
    writeFileSync(pngPath, Buffer.from(shot.result.data, 'base64'));
    console.log('png:', pngPath, Math.round(Buffer.from(shot.result.data, 'base64').length / 1024) + 'KB');
    // Compress to JPEG <= 256 KiB with PIL.
    const jpgPath = join(OUT, `shot-${name}.jpg`);
    try {
      execSync(`python3 -c "
from PIL import Image
import sys
im = Image.open('${pngPath}').convert('RGB')
for q in (88, 80, 72, 64, 55):
    im.save('${jpgPath}', 'JPEG', quality=q)
    import os
    if os.path.getsize('${jpgPath}') <= 262144:
        print('jpg q', q, os.path.getsize('${jpgPath}') // 1024, 'KB')
        break
else:
    im2 = im.resize((1024, 640))
    im2.save('${jpgPath}', 'JPEG', quality=72)
    print('jpg resized', os.path.getsize('${jpgPath}') // 1024, 'KB')
"`, { stdio: 'inherit' });
    } catch (e) {
      console.log('PIL compress failed, keeping PNG:', e.message);
    }
  } catch (e) {
    console.log('SHOTS ERROR for', name + ':', e.message);
    exitCode = 1;
  } finally {
    try { ws.close(); } catch {}
    try { chrome.kill('SIGKILL'); } catch {}
    await sleep(1000);
  }
}
// List final screenshots.
try { console.log(execSync(`ls -la ${OUT}/`).toString()); } catch {}
process.exit(exitCode);
