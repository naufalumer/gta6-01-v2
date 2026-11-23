import * as THREE from 'three';
import { clamp, lerp, angLerp, fmtCash, mulberry32, glowTexture, smokeTexture } from './utils.js';
import { buildCity, districtAt, STREETS, DISTRICTS } from './city.js';
import { createVehicle, createBike, createHeli, driveVehicle, damageVehicle, spawnParkedCars, spawnTraffic, updateTraffic, updateLightBars, CAR_MODELS } from './vehicles.js';
import { makePlayer, spawnPeds, updatePeds, knockPed, scarePeds, updatePlayerOnFoot } from './people.js';
import { initPolice, addWanted, updatePolice, patrolList, removeVehicle } from './police.js';
import { startMission, updateMissions, setMarker, clearMarker, startRace, damageEnemy, GARAGE_POS, SAFEHOUSE_POS, CASINO_POS, RACE_START } from './missions.js';
import { initActivities, openGarage, buyGarage, openShop, buyShop, spinSlots, startFishing, fishStrike, startBasketball, nearestPackage, collectPackage, startCourier, updateActivities, WEAPONS } from './activities.js';
import { HUD } from './hud.js';
import { updateDayCycle } from './daycycle.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { applyShot } from './shots.js';

const SHOP_POS = { x: 20, z: -120 };
const CLINIC_POS = { x: 120, z: 120 };
const PRECINCT_POS = { x: 80, z: 80 };
const params = new URLSearchParams(location.search);
const PLAYTEST = params.has('playtest');
const SHOT = params.get('shot');

const G = {
  state: 'title', time: 0, dayTime: 18 * 60 + 45, phaseName: 'dusk', nightF: 0,
  vehicles: [], peds: [], enemies: [], camYaw: Math.PI, camPitch: 0.32, camDist: 9, camHeight: 3,
  shake: 0, mouseIdle: 0, interact: null, garageSel: null, shopSel: null,
  mission: { index: 0, def: null, active: false, timer: 0, data: {} },
  race: { active: false, laps: 0, context: '', countdown: 0, cp: 0, lap: 1, rivals: [], startT: 0, playerTime: 0 },
  STREETS, districts: DISTRICTS,
  districtName: (x, z) => districtAt(x, z).name,
  patrolList: (g) => patrolList(g),
};
window.__azura = G;

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
G.renderer = renderer;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff9e7a);
scene.fog = new THREE.Fog(0xf2a58e, 120, 620);
G.scene = scene;
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
G.camera = camera;
const sun = new THREE.DirectionalLight(0xff8a4d, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 800;
scene.add(sun); scene.add(sun.target);
G.sun = sun;
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a2a1a, 0.85);
scene.add(hemi);
G.hemi = hemi;
{
  const env = new THREE.Scene();
  const top = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), new THREE.MeshBasicMaterial({ color: 0x6fc4f0, side: THREE.BackSide }));
  env.add(top);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

G.audio = new AudioSys();
G.hud = new HUD(G);
G.input = new Input(G);
buildCity(G);
spawnParkedCars(G);
spawnTraffic(G);
makePlayer(G);
spawnPeds(G);
initPolice(G);
initActivities(G);
G.truck = createVehicle(G, 'truck', 300, -160, Math.PI / 2, { name: 'Syndicate Hauler', color: 0x14161c, parked: true });
G.roofHeli = createHeli(G, -160, 200, 0, false);
createBike(G, 24, -100, Math.PI / 2, 0xd94f3d);

const glowTex = glowTexture(), smokeTex = smokeTexture();
const smokePool = [];
for (let i = 0; i < 140; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
  s.scale.set(1, 1, 1); scene.add(s);
  smokePool.push({ s, life: 0, max: 1, grow: 1, vy: 0 });
}
let smokeI = 0;
G.spawnSmoke = (x, y, z, scale, alpha, color) => {
  const p = smokePool[smokeI++ % smokePool.length];
  p.s.position.set(x, y, z);
  p.s.material.color.setHex(color);
  p.s.material.opacity = alpha;
  p.s.scale.set(scale, scale, 1);
  p.life = p.max = 1.6; p.grow = scale * 1.8; p.vy = 0.8;
};
const flashLight = new THREE.PointLight(0xffa040, 0, 60);
scene.add(flashLight);
G.explode = (x, y, z, scale = 1) => {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  f.position.set(x, y + 1, z); f.scale.set(6 * scale, 6 * scale, 1); scene.add(f);
  let t = 0;
  const iv = setInterval(() => { t += 0.08; f.material.opacity = 1 - t; f.scale.setScalar(6 * scale * (1 + t)); if (t >= 1) { clearInterval(iv); scene.remove(f); } }, 80);
  for (let i = 0; i < 10; i++) G.spawnSmoke(x + (Math.random() - 0.5) * 3, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 3, 2 * scale, 0.7, 0x555555);
  flashLight.position.set(x, y + 3, z); flashLight.intensity = 60 * scale;
  G.audio.explosion(); G.shake = Math.max(G.shake, 0.7);
  scarePeds(G, x, z, 45);
  G.player.stats.explosions++;
  for (const v of [...G.vehicles]) if (Math.hypot(v.x - x, v.z - z) < 9 * scale && v.health > 0) damageVehicle(G, v, 70);
  for (const e of [...G.enemies]) if (Math.hypot(e.x - x, e.z - z) < 9 * scale && e.alive) { e.hp = 0; }
  for (const ped of G.peds) if (Math.hypot(ped.x - x, ped.z - z) < 8 * scale) knockPed(G, ped, false);
  if (Math.hypot(G.player.x - x, G.player.z - z) < 9 * scale) G.hurtPlayer(35, 'explosion');
};
const skidPool = [];
G.addSkid = (x, z, heading) => {
  if (skidPool.length > 80) { const old = skidPool.shift(); scene.remove(old); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.8), new THREE.MeshBasicMaterial({ color: 0x0a0a0c, transparent: true, opacity: 0.55 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = -heading;
  m.position.set(x, 0.09, z); scene.add(m); skidPool.push(m);
};

G.addWanted = (n, reason) => addWanted(G, n, reason);
G.hurtPlayer = (dmg, src) => {
  const p = G.player;
  if (p.armor > 0) { const absorbed = Math.min(p.armor, dmg); p.armor -= absorbed; dmg -= absorbed; }
  p.health -= dmg;
  const flash = document.getElementById('flash');
  flash.style.opacity = 0.8;
  setTimeout(() => { flash.style.opacity = 0; }, 160);
  if (p.health <= 0) G.wastePlayer();
};
G.bustPlayer = () => {
  if (G.state !== 'play') return;
  const p = G.player;
  const fine = Math.min(p.cash, 300 + G.wanted.stars * 100);
  p.cash -= fine;
  G.wanted.stars = 0;
  G.exitVehicle(true);
  p.x = PRECINCT_POS.x; p.z = PRECINCT_POS.z; p.health = 100; p.y = 0; p.vy = 0;
  p.mesh.position.set(p.x, 0, p.z);
  G.audio.fail();
  G.state = 'busted';
  G.hud.showScreen('busted');
  G.hud.toast('BUSTED — fine ' + fmtCash(fine));
};
G.wastePlayer = () => {
  if (G.state !== 'play') return;
  const p = G.player;
  p.cash = Math.max(0, p.cash - 200);
  G.wanted.stars = 0;
  G.exitVehicle(true);
  p.x = CLINIC_POS.x; p.z = CLINIC_POS.z; p.health = 100; p.armor = 0; p.y = 0; p.vy = 0;
  p.mesh.position.set(p.x, 0, p.z);
  G.audio.fail();
  G.state = 'wasted';
  G.hud.showScreen('wasted');
  G.hud.toast('WASTED — clinic fee $200');
};
G.enterVehicle = (v, silent = false) => {
  const p = G.player;
  if (!v || v.dead) return;
  if (v.ai === 'traffic') v.ai = null;
  if (v.police && G.police.cars.some((u) => u.v === v)) {
    G.police.cars = G.police.cars.filter((u) => u.v !== v);
    G.addWanted(2, 'stole a patrol car');
  } else if (v.parked && !v.owned) {
    G.addWanted(1, 'stole a car');
    p.stats.carsStolen++;
    G.hud.toast('STOLEN — WANTED +1');
  }
  v.parked = false;
  p.vehicle = v; p.onFoot = false;
  p.x = v.x; p.z = v.z; p.heading = v.heading;
  if (v.kind !== 'bike') p.mesh.visible = false;
  if (!silent) G.audio.click();
};
G.exitVehicle = (force = false) => {
  const p = G.player;
  const v = p.vehicle;
  if (!v) return;
  if (v.kind === 'heli' && v.y > 2 && !force) return;
  const side = 2.6;
  p.x = v.x + Math.cos(v.heading) * side; p.z = v.z - Math.sin(v.heading) * side;
  p.heading = v.heading; p.y = 0; p.vy = 0;
  p.onFoot = true; p.vehicle = null;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
};
function nearestVehicle(maxD) {
  const p = G.player;
  let best = null, bd = maxD;
  for (const v of G.vehicles) {
    if (v.dead) continue;
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
const raycaster = new THREE.Raycaster();
const tracers = [];
function shoot() {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  const now = G.time;
  if (p._lastShot && now - p._lastShot < w.rate) return;
  const ammo = p.ammo[p.weapon];
  if (!ammo || ammo[0] <= 0) { G.audio.click(); return; }
  p._lastShot = now;
  ammo[0]--;
  if (ammo[0] === 0) { /* auto reload on next trigger */ }
  G.audio.shot();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [];
  for (const e of G.enemies) if (e.alive) targets.push(e.mesh);
  for (const v of G.vehicles) if (!v.dead) targets.push(v.mesh);
  for (const ped of G.peds) if (ped.down <= 0) targets.push(ped.mesh);
  for (const c of G.police.foot) targets.push(c.mesh);
  const hits = raycaster.intersectObjects(targets, true);
  let end = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 120);
  if (hits.length) {
    const h = hits[0];
    end = h.point.clone();
    const d = h.distance;
    const fall = clamp(1 - d / 90, 0.3, 1);
    let target = h.object;
    while (target && target.parent && !target.userData.tag) target = target.parent;
    const tag = target ? target.userData.tag : null;
    if (tag === 'enemy') { const e = G.enemies.find((x) => x.mesh === target); if (e) damageEnemy(G, e, w.dmg * fall * (w.pellets || 1)); }
    else if (tag === 'vehicle') { const v = G.vehicles.find((x) => x.mesh === target); if (v) damageVehicle(G, v, w.dmg * fall); }
    else if (tag === 'ped') { const ped = G.peds.find((x) => x.mesh === target); if (ped) knockPed(G, ped, false); }
    else if (tag === 'cop') { G.addWanted(1, 'shot a cop'); }
    G.spawnSmoke(end.x, end.y, end.z, 0.5, 0.6, 0xffd98a);
  }
  const start = new THREE.Vector3(p.x, p.y + 1.4, p.z);
  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, t: 0.09 });
  if (tracers.length > 6) { const old = tracers.shift(); scene.remove(old.line); }
}
function tagGroups() {
  for (const v of G.vehicles) v.mesh.userData.tag = 'vehicle';
  for (const ped of G.peds) ped.mesh.userData.tag = 'ped';
  for (const c of G.police.foot) c.mesh.userData.tag = 'cop';
  for (const e of G.enemies) e.mesh.userData.tag = 'enemy';
}
function updateInteract(inp) {
  const p = G.player;
  let prompt = null, action = null;
  const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
  if (G.activity.mode === 'fish' && G.activity.fish && G.activity.fish.state === 'bite') {
    prompt = '<b>E</b> STRIKE!'; action = () => fishStrike(G);
  } else if (nearestPackage(G)) {
    prompt = '<b>E</b> TAKE PACKAGE (+$150)'; action = () => collectPackage(G, nearestPackage(G));
  } else if (p.vehicle && near(GARAGE_POS.x, GARAGE_POS.z, 13)) {
    prompt = '<b>E</b> ENTER TIDEWORKS CUSTOMS'; action = () => openGarage(G);
  } else if (p.onFoot && near(SHOP_POS.x, SHOP_POS.z, 6)) {
    prompt = '<b>E</b> IRONWORKS ARMS'; action = () => openShop(G);
  } else if (p.onFoot && near(CASINO_POS.x, CASINO_POS.z, 8)) {
    prompt = '<b>E</b> CORAL CROWN SLOTS'; action = () => { G.state = 'casino'; document.getElementById('casino-cash').textContent = fmtCash(p.cash); G.hud.showScreen('casino'); };
  } else if (p.onFoot && p.z > 300 && p.x > -8 && p.x < 40) {
    prompt = '<b>E</b> FISH OFF PIER 9'; action = () => startFishing(G);
  } else if (p.onFoot && near(-40, 280, 9)) {
    prompt = '<b>E</b> PLAY STREET BALL'; action = () => startBasketball(G);
  } else if (p.onFoot && near(GARAGE_POS.x, GARAGE_POS.z, 10)) {
    prompt = '<b>E</b> START COURIER JOB ($300)'; action = () => startCourier(G);
  } else if (p.vehicle && near(RACE_START.x, RACE_START.z, 13) && !G.race.active) {
    prompt = '<b>E</b> START STREET RACE ($1,000)'; action = () => startRace(G, 3, 'side');
  } else if (p.onFoot) {
    const v = nearestVehicle(4.5);
    if (v) { prompt = '<b>F</b> ' + (v.parked || v.ai ? 'STEAL ' : 'ENTER ') + v.name.toUpperCase(); }
  } else if (p.vehicle) {
    prompt = '<b>F</b> EXIT ' + p.vehicle.name.toUpperCase();
  }
  G.interact = action;
  G.hud.setPrompt(prompt);
}
function saveGame() {
  const p = G.player;
  const data = {
    cash: p.cash, respect: p.respect, mission: G.mission.index,
    owned: p.owned, ammo: p.ammo, stats: p.stats,
    packages: G.packages.filter((x) => x.got).length,
    jetpack: p.jetpack, x: p.x, z: p.z,
  };
  try { localStorage.setItem('azura-save-v1', JSON.stringify(data)); } catch { /* storage unavailable */ }
  G.hud.toast('SAVED');
}
G.saveGame = saveGame;
function loadGame() {
  try {
    const raw = localStorage.getItem('azura-save-v1');
    if (!raw) return false;
    const d = JSON.parse(raw);
    const p = G.player;
    p.cash = d.cash; p.respect = d.respect; p.owned = d.owned; p.ammo = d.ammo;
    p.stats = { ...p.stats, ...d.stats };
    p.jetpack = !!d.jetpack;
    p.x = d.x || 0; p.z = d.z || 20;
    G.mission.index = d.mission || 0;
    G.packages.forEach((pk, i) => { if (i < d.packages) { pk.got = true; scene.remove(pk.mesh); } });
    p.mesh.position.set(p.x, 0, p.z);
    return true;
  } catch { return false; }
}
function updateCamera(dt) {
  const p = G.player;
  const [mdx, mdy] = G.input.consumeMouse();
  if (mdx || mdy) { G.camYaw -= mdx * 0.0038; G.camPitch = clamp(G.camPitch + mdy * 0.0022, 0.08, 0.9); G.mouseIdle = 0; }
  else G.mouseIdle += dt;
  const v = p.vehicle;
  if (v && G.mouseIdle > 2.5) {
    const behind = v.heading + Math.PI;
    G.camYaw = angLerp(G.camYaw, behind, clamp(dt * 1.6, 0, 1));
  }
  const dist = v ? (v.kind === 'heli' ? 16 : 11 + Math.abs(v.speed) * 0.06) : 8;
  const height = v && v.kind === 'heli' ? 6 : 3.2 + Math.abs(v ? v.speed : p.speed) * 0.02;
  const cx = p.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = p.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = (v && v.kind === 'heli' ? v.y : p.y) + Math.sin(G.camPitch) * dist + height * 0.55;
  camera.position.set(
    cx + (Math.random() - 0.5) * G.shake * 0.6,
    cy + (Math.random() - 0.5) * G.shake * 0.6,
    cz + (Math.random() - 0.5) * G.shake * 0.6,
  );
  const lx = p.x + Math.sin(G.camYaw) * 4, lz = p.z + Math.cos(G.camYaw) * 4;
  camera.lookAt(lx, (v && v.kind === 'heli' ? v.y : p.y) + 1.6, lz);
  G.shake = Math.max(0, G.shake - dt * 1.8);
  sun.position.set(p.x + 180, 260, p.z + 120);
  sun.target.position.set(p.x, 0, p.z);
}
const $ = (id) => document.getElementById(id);
function startGame(fresh) {
  G.audio.init(); G.audio.resume();
  if (fresh) { try { localStorage.removeItem('azura-save-v1'); } catch { /* ignore */ } }
  else loadGame();
  G.state = 'play';
  G.hud.showScreen(null);
  $('hud').style.display = 'block';
  if (!G.mission.active && G.mission.index < 6) setTimeout(() => { if (G.state === 'play') startMission(G, G.mission.index); }, 800);
}
$('btn-play').onclick = () => startGame(true);
$('btn-continue').onclick = () => startGame(false);
if (localStorage.getItem('azura-save-v1')) $('btn-continue').style.display = 'block';
$('btn-howto').onclick = () => { const h = $('howto'); h.style.display = h.style.display === 'block' ? 'none' : 'block'; G.audio.click(); };
$('btn-resume').onclick = () => { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; };
$('btn-save').onclick = () => saveGame();
$('btn-quit').onclick = () => { saveGame(); G.state = 'title'; G.hud.showScreen('title'); $('hud').style.display = 'none'; };
$('btn-map-resume').onclick = () => { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; };
$('btn-map-save').onclick = () => saveGame();
$('btn-map-menu').onclick = () => { saveGame(); G.state = 'title'; G.hud.showScreen('title'); $('hud').style.display = 'none'; };
$('btn-garage-leave').onclick = () => { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; };
$('btn-shop-leave').onclick = () => { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; };
$('btn-casino-leave').onclick = () => { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; };
$('btn-spin').onclick = () => spinSlots(G);
$('btn-busted-retry').onclick = () => { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; };
$('btn-wasted-retry').onclick = () => { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; };
G.input.onKey['KeyE'] = () => { if (G.state === 'play' && G.interact) G.interact(); };
G.input.onKey['KeyF'] = () => {
  if (G.state !== 'play') return;
  if (G.player.vehicle) G.exitVehicle();
  else { const v = nearestVehicle(4.5); if (v) G.enterVehicle(v); }
};
G.input.onKey['KeyQ'] = () => { if (G.state === 'play') { const st = G.audio.nextStation(); G.hud.toast('RADIO — ' + st.name); } };
G.input.onKey['KeyM'] = () => {
  if (G.state === 'play') { G.state = 'map'; G.hud.drawMap(); G.hud.showScreen('mapscreen'); $('hud').style.display = 'none'; }
  else if (G.state === 'map') { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; }
};
G.input.onKey['Escape'] = () => {
  if (G.state === 'play') { G.state = 'pause'; G.hud.showScreen('pause'); }
  else if (G.state === 'pause') { G.state = 'play'; G.hud.showScreen(null); }
  else if (G.state === 'map') { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; }
  else if (G.state === 'garage' || G.state === 'shop' || G.state === 'casino') { G.state = 'play'; G.hud.showScreen(null); $('hud').style.display = 'block'; }
};
G.input.onKey['KeyR'] = () => {
  const p = G.player;
  if (G.state !== 'play' || p.vehicle) return;
  const w = WEAPONS[p.weapon], a = p.ammo[p.weapon];
  if (!a || a[1] <= 0 || a[0] === w.mag) return;
  const need = w.mag - a[0], take = Math.min(need, a[1]);
  a[0] += take; a[1] -= take;
  G.audio.reload();
};
for (const [code, key] of [['Digit1', 'pistol'], ['Digit2', 'smg'], ['Digit3', 'shotgun']]) {
  G.input.onKey[code] = () => {
    const p = G.player;
    if (G.state === 'play' && p.owned[key]) { p.weapon = key; G.hud.toast(WEAPONS[key].name); }
  };
}
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  if (G.state === 'play') {
    const inp = G.input.poll();
    const p = G.player;
    if (p.vehicle) {
      const v = p.vehicle;
      if (v.kind === 'heli') {
        const climb = inp.jump ? 1 : 0, descend = inp.back ? 1 : 0;
        v.y = clamp(v.y + (climb - descend) * 11 * dt, 0, 90);
        v.speed = lerp(v.speed, inp.fwd ? v.top : 0, clamp(dt * 1.4, 0, 1));
        v.heading += ((inp.left ? 1 : 0) - (inp.right ? 1 : 0)) * 1.3 * dt;
        v.x += Math.sin(v.heading) * v.speed * dt;
        v.z += Math.cos(v.heading) * v.speed * dt;
        [v.x, v.z] = G.city.collide(v.x, v.z, 1.6);
        v.mesh.position.set(v.x, v.y, v.z);
        v.mesh.rotation.y = v.heading;
        v.mesh.rotation.x = inp.fwd ? 0.08 : 0;
        if (v.rotor) v.rotor.rotation.y += dt * 24;
        if (v.tailRotor) v.tailRotor.rotation.z += dt * 32;
        if (v.y > 1 && Math.random() < dt * 0.4) G.audio.heli();
        p.x = v.x; p.z = v.z; p.y = v.y; p.heading = v.heading;
      } else {
        driveVehicle(G, v, inp, dt);
        p.x = v.x; p.z = v.z; p.y = 0; p.heading = v.heading;
        p.stats.kmDriven += Math.abs(v.speed) * dt / 1000;
        if (v.kind === 'bike') {
          p.mesh.visible = true;
          p.mesh.position.set(v.x, 0.55, v.z);
          p.mesh.rotation.y = v.heading;
          p.mesh.rotation.x = 0.25;
        }
        for (const ped of G.peds) {
          if (ped.down <= 0 && Math.hypot(ped.x - v.x, ped.z - v.z) < 2.2 && Math.abs(v.speed) > 5) knockPed(G, ped, true);
        }
      }
      G.audio.engine(Math.abs(v.speed) / v.top, true);
    } else {
      updatePlayerOnFoot(G, dt, inp);
      G.audio.engine(0, false);
      if (inp.fire) shoot();
    }
    updateTraffic(G, dt);
    updateLightBars(G, G.time);
    updatePeds(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateActivities(G, dt, inp);
    updateDayCycle(G, dt);
    updateInteract(inp);
    tagGroups();
    G.audio.radio(dt, G.wanted.stars / 5);
    G.audio.siren(Math.hypot(G.player.x - (G.police.cars[0] ? G.police.cars[0].v.x : 1e4), G.player.z - (G.police.cars[0] ? G.police.cars[0].v.z : 1e4)), G.police.cars.length > 0);
    for (const sp of smokePool) {
      if (sp.life > 0) {
        sp.life -= dt;
        const a = Math.max(0, sp.life / sp.max);
        sp.s.material.opacity = a * 0.6;
        sp.s.scale.setScalar(sp.grow * (1.6 - a * 0.6));
        sp.s.position.y += sp.vy * dt;
        if (sp.life <= 0) sp.s.material.opacity = 0;
      }
    }
    for (const tr of [...tracers]) { tr.t -= dt; if (tr.t <= 0) { scene.remove(tr.line); tracers.splice(tracers.indexOf(tr), 1); } }
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 220);
    G.hud.update(dt);
  } else if (G.state === 'title') {
    const a = G.time * 0.05;
    camera.position.set(Math.sin(a) * 120, 55, Math.cos(a) * 120);
    camera.lookAt(0, 8, 0);
    updateDayCycle(G, dt);
    for (const sp of smokePool) if (sp.life > 0) { sp.life -= dt; sp.s.material.opacity = Math.max(0, sp.life / sp.max) * 0.6; }
  }
  if (G.state !== 'title') updateCamera(dt);
  renderer.render(scene, camera);
}
$('hud').style.display = 'none';
if (SHOT) {
  G.audio.init = () => {}; // no audio in screenshot mode
  startGame(true);
  applyShot(G, SHOT);
  G.hud.update(0);
} else if (PLAYTEST) {
  G.audio.init = () => {};
}
frame();

G.state2 = () => ({
  state: G.state, x: +G.player.x.toFixed(1), z: +G.player.z.toFixed(1),
  cash: G.player.cash, respect: G.player.respect, health: Math.round(G.player.health),
  wanted: G.wanted.stars, mission: G.mission.index, missionActive: G.mission.active,
  vehicle: G.player.vehicle ? G.player.vehicle.name : null,
  vehicles: G.vehicles.length, peds: G.peds.length, enemies: G.enemies.length,
  time: G.dayTime, phase: G.phaseName, race: G.race.active,
});
G.teleport = (x, z) => { G.player.x = x; G.player.z = z; if (G.player.vehicle) { G.player.vehicle.x = x; G.player.vehicle.z = z; } G.player.mesh.position.set(x, G.player.y, z); };
G.shoot = shoot;
G.giveCash = (n) => { G.player.cash += n; };
G.setWanted = (n) => { G.wanted.stars = n; };
G.startMissionAt = (i) => startMission(G, i);
G.giveWeapon = (k) => { G.player.owned[k] = true; G.player.ammo[k] = [WEAPONS[k].mag, WEAPONS[k].mag * 4]; G.player.weapon = k; };
G.setTime = (h, m) => { G.dayTime = h * 60 + (m || 0); };
