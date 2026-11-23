// AZURA BAY 36-check playtest driver (CDP + headless-shell) — v2.
// FRAME-BASED: movement checks hold keys for a target amount of GAME time
// (G.time advances 0.05/frame), so results are deterministic even when
// SwiftShader runs at ~1-3 fps. Wall-clock sleeps are only for page load,
// setTimeout-driven delays, and screenshots.
// v2 fixes (from playtest 5 diagnosis — all were DRIVER bugs, not game bugs):
//  - game exposes G.mission.index (not missionIdx); G.phaseName / G.sun
//    (not G.day.phase / G.day.sun); save key is 'azura-save-v1'.
//  - mission target is G.marker (set by the mission intro), not G.mission.t.
//  - mission 2 starts 4.5s WALL-clock after mission 1 completes.
//  - fishing/basketball do NOT change G.state (they set G.activity.mode);
//    tapping Escape after starting them PAUSES the game and cascades failures.
//  - gun shop / casino / fishing / basketball need onFoot; garage needs a vehicle.
//  - teleport coords must match the game's real positions (SHOP 20,-120;
//    CASINO 10,40; GARAGE -8,-40; Pier 9 z>300; court -40,280; package spot
//    -36,-268 (PACKAGE_SPOTS in activities.js).
//  - R reload and weapon switch are blocked in a vehicle; SMG must be bought first.
//  - key taps need a frame between down/up and after the tap (1-3 fps).
// v3 fixes (from playtest 6 diagnosis — again all DRIVER bugs, 0 game bugs):
//  - basketball: a 2-frame hold -> power ~0.14 overshoots the hoop at 7.5m;
//    shoot from 9.0m (scores for power 0..0.21) with a power-aware release
//    (release once power >= 0.05, i.e. after the first charging frame).
//  - hidden package: (80,-280) is NOT a package spot; real spots are
//    PACKAGE_SPOTS in activities.js (e.g. -36,-268).
//  - casino spin: poll #casino-msg up to 10s; headless timer throttle delays
//    the 1500ms setTimeout past a fixed 2200ms sleep.
//  - save reload: click btn-continue (loads the save); btn-play starts FRESH
//    and DELETES the save.
// Usage: node tools/playtest.js
import { spawn } from 'node:child_process';
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const PORT = 9223;
const URL = 'http://localhost:8080/?playtest=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const log = (ok, n, label, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${String(n).padStart(2, ' ')}. ${label} ${extra}`); };

const chrome = spawn(CHROME, [
  '--remote-debugging-port=' + PORT, '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=800,600', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--hide-scrollbars', '--disable-frame-rate-limit', '--run-all-compositor-stages-before-draw', URL,
], { stdio: ['ignore', 'pipe', 'pipe'] });
let exitCode = 0;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${PORT}/json/version`)).ok; } catch {} if (!up) await sleep(500); }
  if (!up) throw new Error('chrome did not start');
  const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') console.log('EXC:', JSON.stringify(m.params.exceptionDetails).slice(0, 400)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('PAGE ERROR:', JSON.stringify(m.params.args).slice(0, 400)); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => reject(new Error('timeout ' + method)), 120000); });
  const evaljs = async (e) => { const m = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (m.result.exceptionDetails) return 'EXC'; return m.result.result ? m.result.result.value : undefined; };
  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(6000);
  // --- frame-based helpers ---
  const gameTime = async () => await evaljs(`window.__azura ? window.__azura.time : 0`);
  const waitGame = async (seconds, maxWallMs = 180000) => {
    const t0 = await gameTime(); const start = Date.now();
    while (Date.now() - start < maxWallMs) {
      if ((await gameTime()) - t0 >= seconds) return true;
      await sleep(200);
    }
    return false;
  };
  const key = async (code, k, vk, type) => send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  const tap = async (code, k, vk) => { await key(code, k, vk, 'keyDown'); await waitGame(0.2); await key(code, k, vk, 'keyUp'); await waitGame(0.3); };
  const holdKeyGame = async (code, k, vk, gameSeconds) => {
    await key(code, k, vk, 'keyDown');
    await waitGame(gameSeconds);
    await key(code, k, vk, 'keyUp');
  };
  const pressE = async () => { await waitGame(0.3); await tap('KeyE', 'e', 69); await waitGame(0.4); };
  const state = async () => await evaljs(`window.__azura.state`);
  const ensurePlay = async () => {
    for (let i = 0; i < 4; i++) {
      const s = await state();
      if (s === 'play') return true;
      await tap('Escape', 'Escape', 27);
    }
    return (await state()) === 'play';
  };
  const enterParkedCar = async () => {
    await evaljs(`(()=>{const G=window.__azura;const v=G.vehicles.find(v=>v.parked&&!v.police);G.teleport(v.x+1,v.z);})()`);
    await waitGame(0.3);
    await tap('KeyF', 'f', 70);
    await waitGame(0.4);
    return await evaljs(`window.__azura.player.vehicle ? window.__azura.player.vehicle.name : 'none'`);
  };

  // 1-2 load + errors
  log(!!(await evaljs(`!!window.__azura`)), 1, 'page loads, __azura present');
  log((await evaljs(`window.__errCount || 0`)) === 0, 2, 'no console errors on load');
  log((await evaljs(`window.__azura.vehicles.length`)) >= 40, 3, 'world built: 40+ vehicles', `[vehicles=${await evaljs(`window.__azura.vehicles.length`)}]`);
  log((await evaljs(`window.__azura.peds.length`)) >= 60, 4, 'pedestrians: 76', `[peds=${await evaljs(`window.__azura.peds.length`)}]`);
  log((await evaljs(`window.__azura.state`)) === 'title', 5, 'title state at boot', `[${await evaljs(`window.__azura.state`)}]`);
  const shot0 = await send('Page.captureScreenshot', { format: 'png' });
  log(Buffer.from(shot0.result.data, 'base64').length > 20000, 6, 'title screen renders (screenshot > 20KB)', `[${Math.round(Buffer.from(shot0.result.data, 'base64').length / 1024)}KB]`);
  // 7-9 start
  await evaljs(`document.getElementById('btn-play').click()`);
  await sleep(2500);
  // render cut: SwiftShader headless only (game itself keeps shadows on real HW)
  await evaljs(`(()=>{const G=window.__azura;G.renderer.shadowMap.enabled=false;G.renderer.setPixelRatio(0.5);})()`);
  log((await evaljs(`window.__azura.state`)) === 'play', 7, 'PLAY starts the game', `[${await evaljs(`window.__azura.state`)}]`);
  log((await evaljs(`window.__azura.mission.index`)) === 0 && (await evaljs(`window.__azura.mission.active`)) === true, 8, 'mission 1 auto-starts', `[index=${await evaljs(`window.__azura.mission.index`)}]`);
  log((await evaljs(`window.__azura.player.cash`)) === 500, 9, 'HUD cash shows $500');
  // 10 on-foot (1.0 game-second of W ~= 6m at walk speed 6)
  const p0 = await evaljs(`[window.__azura.player.x, window.__azura.player.z]`);
  await holdKeyGame('KeyW', 'w', 87, 1.0);
  const p1 = await evaljs(`[window.__azura.player.x, window.__azura.player.z]`);
  const d10 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  log(d10 >= 3, 10, 'on-foot movement with W', `[moved ${d10.toFixed(1)}m]`);
  // 11-12 enter car
  const carName = await enterParkedCar();
  log(carName !== 'none', 11, 'F enters a parked car', `[${carName}]`);
  log((await evaljs(`window.__azura.wanted.stars`)) >= 1, 12, 'stealing raises wanted to 1', `[wanted=${await evaljs(`window.__azura.wanted.stars`)}]`);
  // 13 drive (2.0 game-seconds of W ~= 30m at accel 15, top 42)
  const c0 = await evaljs(`[window.__azura.player.vehicle.x, window.__azura.player.vehicle.z, window.__azura.player.vehicle.speed]`);
  await holdKeyGame('KeyW', 'w', 87, 2.0);
  const c1 = await evaljs(`[window.__azura.player.vehicle.x, window.__azura.player.vehicle.z, window.__azura.player.vehicle.speed]`);
  const d13 = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  log(d13 >= 10, 13, 'car drives with W', `[drove ${d13.toFixed(0)}m, speed ${c1[2].toFixed(1)}]`);
  // 14 mission 1 completes at garage (marker = GARAGE_POS, player must be in a car)
  await evaljs(`(()=>{const G=window.__azura;G.teleport(G.marker.x, G.marker.z);})()`);
  await waitGame(1.0);
  log((await evaljs(`window.__azura.mission.index`)) === 1 && (await evaljs(`window.__azura.player.cash`)) === 900, 14, 'mission 1 completes at the garage', `[mission=${await evaljs(`window.__azura.mission.index`)} cash=$${await evaljs(`window.__azura.player.cash`)}]`);
  // 15 mission 2 starts 4.5s WALL-clock after completion
  await sleep(6000);
  log((await evaljs(`window.__azura.mission.index`)) === 1 && (await evaljs(`window.__azura.mission.def`)) !== null, 15, 'mission 2 (courier) auto-starts');
  // 16-18 police
  await evaljs(`window.__azura.setWanted(3)`);
  await waitGame(2.0);
  const pc = await evaljs(`window.__azura.police.cars.length`);
  log(pc >= 2, 16, 'wanted 3 spawns police cars', `[cars=${pc}]`);
  const q0 = await evaljs(`window.__azura.police.cars.length ? [window.__azura.police.cars[0].v.x, window.__azura.police.cars[0].v.z] : [0,0]`);
  await waitGame(1.0);
  const q1 = await evaljs(`window.__azura.police.cars.length ? [window.__azura.police.cars[0].v.x, window.__azura.police.cars[0].v.z] : [0,0]`);
  log(Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) >= 2, 17, 'police cars pursue (move)', `[moved ${Math.hypot(q1[0] - q0[0], q1[1] - q0[1]).toFixed(1)}m]`);
  await evaljs(`window.__azura.setWanted(0)`);
  await waitGame(1.0);
  log((await evaljs(`window.__azura.police.cars.length`)) === 0, 18, 'wanted 0 clears police');
  // 19-20 weapons on foot (reload/switch are blocked in a vehicle)
  await tap('KeyF', 'f', 70);
  await waitGame(0.4);
  log((await evaljs(`window.__azura.player.vehicle`)) === null, 19, 'F exits the car (on foot for weapons)', `[vehicle=${await evaljs(`window.__azura.player.vehicle ? 1 : 0`)}]`);
  const a0 = await evaljs(`window.__azura.player.ammo[window.__azura.player.weapon][0]`);
  await evaljs(`(()=>{const G=window.__azura;G.player.heading=0;G.shoot();})()`);
  const a1 = await evaljs(`window.__azura.player.ammo[window.__azura.player.weapon][0]`);
  log(a1 === a0 - 1, 20, 'shooting consumes ammo (pistol)', `[${a0} -> ${a1}]`);
  await tap('KeyR', 'r', 82);
  await waitGame(0.4);
  log((await evaljs(`window.__azura.player.ammo[window.__azura.player.weapon][0]`)) === 12, 21, 'R reloads pistol to 12', `[${a1} -> ${await evaljs(`window.__azura.player.ammo[window.__azura.player.weapon][0]`)}]`);
  // 22 gun shop: buy the SMG via the real shop UI (test funds via the G.giveCash hook)
  const cShop0 = await evaljs(`window.__azura.player.cash`);
  await evaljs(`window.__azura.giveCash(3000)`);
  await evaljs(`window.__azura.teleport(20, -120)`);
  await pressE();
  log((await evaljs(`window.__azura.state`)) === 'shop', 22, 'E at Ironworks opens the gun shop');
  const buyRes = await evaljs(`(()=>{const el=[...document.querySelectorAll('#shop-weapons .item')].find(e=>e.textContent.includes('RATTLER')); if(!el) return 'NO-ROW'; el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return 'OK';})()`);
  await waitGame(0.5);
  const ownedSmg = await evaljs(`!!window.__azura.player.owned['smg']`);
  const cShop1 = await evaljs(`window.__azura.player.cash`);
  log(buyRes === 'OK' && ownedSmg && cShop1 === cShop0 + 3000 - 2400, 23, 'shop sells the RATTLER SMG for $2,400', `[${buyRes} owned=${ownedSmg} $${cShop0} -> $${cShop1}]`);
  await tap('Escape', 'Escape', 27);
  await waitGame(0.4);
  await tap('Digit2', '2', 50);
  await waitGame(0.4);
  log((await evaljs(`window.__azura.player.weapon`)) === 'smg', 24, 'weapon switch (2 = SMG after purchase)');
  // 25 fishing: real catch (bite -> strike -> tension-managed reel)
  await evaljs(`window.__azura.teleport(16, 320)`);
  await pressE();
  log((await evaljs(`window.__azura.activity.mode`)) === 'fish', 25, 'E on Pier 9 starts fishing');
  let caught = false;
  const cashFish0 = await evaljs(`window.__azura.player.cash`);
  for (let attempt = 0; attempt < 2 && !caught; attempt++) {
    // wait for the bite (up to ~6 game-sec of waiting)
    let bit = false;
    const tStart = Date.now();
    while (Date.now() - tStart < 90000) {
      const st = await evaljs(`window.__azura.activity.fish ? window.__azura.activity.fish.state : 'gone'`);
      if (st === 'bite') { bit = true; break; }
      if (st === 'gone') break;
      await sleep(300);
    }
    if (!bit) break;
    await pressE(); // strike
    await waitGame(0.3);
    // reel: bang-bang the Space key to keep tension mid-range
    let spaceDown = false;
    const rStart = Date.now();
    while (Date.now() - rStart < 150000) {
      const f = await evaljs(`window.__azura.activity.fish ? { t: window.__azura.activity.fish.tension, s: window.__azura.activity.fish.state } : null`);
      if (!f) break;
      if (f.t > 60 && spaceDown) { await key('Space', ' ', 32, 'keyUp'); spaceDown = false; }
      else if (f.t < 40 && !spaceDown) { await key('Space', ' ', 32, 'keyDown'); spaceDown = true; }
      await sleep(250);
    }
    if (spaceDown) { await key('Space', ' ', 32, 'keyUp'); spaceDown = false; }
    const cashFish1 = await evaljs(`window.__azura.player.cash`);
    if (cashFish1 > cashFish0) { caught = true; break; }
    // escaped: cast again if the activity ended
    if ((await evaljs(`window.__azura.activity.mode`)) === null) { await pressE(); await waitGame(0.5); }
  }
  const cashFishEnd = await evaljs(`window.__azura.player.cash`);
  log(caught && cashFishEnd > cashFish0, 26, 'fishing catch pays out', `[cash $${cashFish0} -> $${cashFishEnd}]`);
  await ensurePlay();
  // 27 basketball: shot from 9.0m — the shot formula (power 7 + P*7 + d*0.45,
  // vy 6 + P*3.5) lands on the hoop at d=9 for power 0..0.21, so a 2-frame
  // hold (dt clamped 0.05 -> P~0.14) scores; at 7.5m that same hold overshoots.
  await evaljs(`window.__azura.teleport(-40, 285.6)`);
  await pressE();
  log((await evaljs(`window.__azura.activity.mode`)) === 'basket', 27, 'E at the court starts basketball');
  let baskets = 0;
  const shotZ = [285.6, 286.1, 285.1];
  for (let shot = 0; shot < 3 && baskets < 1; shot++) {
    // power-aware release: hold Space, release once the first charging frame
    // registers (power >= 0.05); a fixed 0.06s hold can span 2 frames (P~0.14).
    await key('Space', ' ', 32, 'keyDown');
    for (let i = 0; i < 20; i++) {
      const pw = await evaljs(`window.__azura.activity.basket ? window.__azura.activity.basket.power : 0`);
      if (pw >= 0.05) break;
      await sleep(100);
    }
    await key('Space', ' ', 32, 'keyUp');
    await waitGame(2.0);
    baskets = await evaljs(`window.__azura.activity.basket ? window.__azura.activity.basket.score : 0`);
    if (baskets < 1) { await evaljs(`window.__azura.teleport(-40, ${shotZ[shot + 1] || 285.6})`); await waitGame(0.3); }
  }
  log(baskets >= 1, 28, 'basketball shot scores', `[score=${baskets}]`);
  await ensurePlay();
  // 29 hidden package (real PACKAGE_SPOTS entry, radius 2.5m)
  const cashP0 = await evaljs(`window.__azura.player.cash`);
  await evaljs(`window.__azura.teleport(-36, -268)`);
  await pressE();
  const cashP1 = await evaljs(`window.__azura.player.cash`);
  log(cashP1 === cashP0 + 150, 29, 'hidden package pays +$150', `[$${cashP0} -> $${cashP1}]`);
  // 30 garage (needs a vehicle)
  const car2 = await enterParkedCar();
  await evaljs(`window.__azura.teleport(-8, -40)`);
  await pressE();
  log((await evaljs(`window.__azura.state`)) === 'garage' && car2 !== 'none', 30, 'E at garage opens Tideworks Customs', `[${car2}]`);
  await tap('Escape', 'Escape', 27);
  await waitGame(0.4);
  // B1 casino (on foot)
  await tap('KeyF', 'f', 70);
  await waitGame(0.4);
  await evaljs(`window.__azura.teleport(10, 40)`);
  await pressE();
  log((await evaljs(`window.__azura.state`)) === 'casino', 'B1', 'E at Coral Crown opens the casino');
  await evaljs(`document.getElementById('btn-spin').click()`);
  // spin resolves via setTimeout(1500); headless timer throttle can delay it,
  // so poll until the message appears (up to 10s) instead of a fixed sleep.
  let casinoMsg = '';
  for (let i = 0; i < 50 && !casinoMsg; i++) { await sleep(200); casinoMsg = (await evaljs(`document.getElementById('casino-msg').textContent`)) || ''; }
  log(typeof casinoMsg === 'string' && casinoMsg.length > 0, 'B2', 'casino spin resolves with a message', `[${(casinoMsg || '').slice(0, 40)}]`);
  await tap('Escape', 'Escape', 27);
  await waitGame(0.4);
  // B3 map
  await tap('KeyM', 'm', 77);
  await waitGame(0.4);
  log((await evaljs(`window.__azura.state`)) === 'map', 'B3', 'M opens the map screen');
  await tap('KeyM', 'm', 77);
  await waitGame(0.4);
  // B4 pause
  await tap('Escape', 'Escape', 27);
  await waitGame(0.4);
  const stPause = await evaljs(`window.__azura.state`);
  await tap('Escape', 'Escape', 27);
  await waitGame(0.4);
  log(stPause === 'pause' && (await evaljs(`window.__azura.state`)) === 'play', 'B4', 'Esc pauses and resumes', `[${stPause} -> ${await evaljs(`window.__azura.state`)}]`);
  // B5 radio
  const r0 = await evaljs(`window.__azura.audio.station`);
  await tap('KeyQ', 'q', 81);
  await waitGame(0.4);
  log((await evaljs(`window.__azura.audio.station`)) === (r0 + 1) % 3, 'B5', 'Q changes radio station', `[${r0} -> ${await evaljs(`window.__azura.audio.station`)}]`);
  // B6 save + reload persistence
  await evaljs(`window.__azura.saveGame()`);
  const savedCash = await evaljs(`window.__azura.player.cash`);
  const hasSave = await evaljs(`!!localStorage.getItem('azura-save-v1')`);
  log(hasSave, 'B6', 'save writes localStorage (azura-save-v1)', `[saved $${savedCash}]`);
  await send('Page.navigate', { url: URL });
  let reloaded = false;
  for (let i = 0; i < 60 && !reloaded; i++) { await sleep(1000); try { reloaded = !!(await evaljs(`!!window.__azura`)); } catch {} }
  await sleep(3000);
  // btn-continue loads the save; btn-play starts FRESH and DELETES the save.
  await evaljs(`document.getElementById('btn-continue').click()`);
  await sleep(2500);
  const cashAfterReload = await evaljs(`window.__azura.player.cash`);
  log(reloaded && cashAfterReload === savedCash, 'B7', 'save persists across reload', `[cash $${savedCash} -> $${cashAfterReload}]`);
  // B8 day cycle
  await evaljs(`window.__azura.setTime(23, 0)`); await waitGame(0.5);
  log((await evaljs(`window.__azura.phaseName`)) === 'night', 'B8', 'night phase at 23:00');
  await evaljs(`window.__azura.setTime(12, 0)`); await waitGame(0.5);
  log((await evaljs(`window.__azura.sun.intensity`)) > 2, 'B9', 'noon sun intensity > 2 at 12:00');
  // B10 helicopter
  await evaljs(`(()=>{const G=window.__azura;const h=G.vehicles.find(v=>v.kind==='heli');G.teleport(h.x+1,h.z);})()`);
  await waitGame(0.4);
  await tap('KeyF', 'f', 70);
  await waitGame(0.4);
  log((await evaljs(`window.__azura.player.vehicle && window.__azura.player.vehicle.kind`)) === 'heli', 'B10', 'F boards the helicopter', `[${await evaljs(`window.__azura.player.vehicle ? window.__azura.player.vehicle.name : 'none'`)}]`);
  const y0 = Number((await evaljs(`window.__azura.player.vehicle ? (window.__azura.player.vehicle.y || 0) : 0`)) || 0);
  await holdKeyGame('Space', ' ', 32, 1.5);
  const y1 = Number((await evaljs(`window.__azura.player.vehicle ? (window.__azura.player.vehicle.y || 0) : 0`)) || 0);
  log((y1 - y0) >= 2, 'B11', 'Space climbs the helicopter', `[${y0.toFixed(1)} -> ${y1.toFixed(1)}]`);
  log((await evaljs(`window.__errCount || 0`)) === 0, 'B12', 'no console errors during play');
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed, ${results.length - passed} failed`);
  ws.close();
} catch (e) {
  console.log('PLAYTEST ERROR:', e.message);
  exitCode = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch {}
  process.exit(exitCode);
}
