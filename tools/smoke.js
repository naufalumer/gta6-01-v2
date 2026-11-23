// Quick smoke: load the game, report FPS, console errors, and __azura state.
import { spawn } from 'node:child_process';
const URL = process.argv[2] || 'http://localhost:8080/?playtest=1';
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 9224;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--no-sandbox', '--disable-dev-shm-usage', '--window-size=800,600', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', URL], { stdio: ['ignore', 'pipe', 'pipe'] });
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${PORT}/json/version`)).ok; } catch {} if (!up) await sleep(500); }
  if (!up) throw new Error('chrome did not start');
  const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result || {}); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 500));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('ERR: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => reject(new Error('timeout ' + method)), 90000);
  });
  const evaljs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
  await send('Runtime.enable');
  await sleep(6000);
  console.log('azura:', await evaljs(`typeof window.__azura`));
  console.log('state:', JSON.stringify(await evaljs(`window.__azura ? window.__azura.state2() : null`)));
  console.log('webgl:', await evaljs(`(()=>{try{const c=document.createElement('canvas');return !!c.getContext('webgl2');}catch(e){return 'ERR '+e.message}})()`));
  const fps = await evaljs(`new Promise((res)=>{let n=0;const t0=performance.now();const tick=()=>{n++;if(performance.now()-t0<3000)requestAnimationFrame(tick);else res((n/3).toFixed(1))};requestAnimationFrame(tick);})`);
  console.log('fps (title screen):', fps);
  console.log('errors:', errors.length ? errors : 'none');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  console.log('screenshot bytes:', Buffer.from(shot.data, 'base64').length);
  ws.close();
} catch (e) {
  console.log('SMOKE ERROR:', e.message);
} finally {
  chrome.kill('SIGKILL');
  process.exit(0);
}
