import * as THREE from 'three';
import { clamp, lerp, fmtCash } from './utils.js';

export const WEAPONS = {
  pistol: { name: 'PISTOL', price: 0, dmg: 12, mag: 12, auto: false, rate: 0.28 },
  smg: { name: 'RATTLER SMG', price: 2400, dmg: 8, mag: 30, auto: true, rate: 0.09 },
  shotgun: { name: 'TIDEBREAKER SHOTGUN', price: 2800, dmg: 6, mag: 6, auto: false, rate: 0.7, pellets: 6 },
  rifle: { name: 'HARRIER RIFLE', price: 6800, dmg: 25, mag: 10, auto: false, rate: 0.5 },
};
const GARAGE_UPGRADES = [
  { id: 'repair', name: 'FULL REPAIR', price: 250, desc: 'Bodywork, paint, engine — back to showroom. Restores condition to 100%.' },
  { id: 'respray', name: 'RESPRAY', price: 400, desc: 'A fresh coat in a new colour. Same car, new attitude.' },
  { id: 'engine', name: 'STAGE 2 TUNE', price: 3200, desc: '+12% top speed. Dax opens the engine and finds horses you did not pay for.' },
  { id: 'armor', name: 'ARMOUR PLATING', price: 3600, desc: 'Half damage from bullets and rams. The car gets heavy; you get calm.' },
  { id: 'nitro', name: 'NITRO KIT', price: 1800, desc: 'Bigger tank, faster refill. Hold Shift to boost — it drinks slower now.' },
  { id: 'jetpack', name: 'JETPACK', price: 4500, desc: 'Strapped to your back, not the car. Jump, then hold Space to fly. Fuel refills on the ground.' },
];
const FISH = [
  { name: 'Sunny Perch', price: 40, w: 0.45 }, { name: 'Bay Bass', price: 90, w: 0.3 },
  { name: 'Neon Eel', price: 180, w: 0.2 }, { name: 'Golden Koi', price: 500, w: 0.05 },
];
const PACKAGE_SPOTS = [
  [-36, -268], [268, -268], [-268, 268], [268, 268], [-36, 36], [36, -36],
  [300, 60], [-300, -140], [16, 372], [-160, 200], [180, -320], [-280, 20],
];
export function initActivities(G) {
  G.activity = { mode: null, fish: null, basket: null, courier: null };
  G.packages = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xffd23e, emissiveIntensity: 1.2 });
  for (const [x, z] of PACKAGE_SPOTS) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), mat);
    m.position.set(x, 0.6, z);
    G.scene.add(m);
    G.packages.push({ mesh: m, x, z, got: false });
  }
  const court = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ color: 0x2f6fd9, roughness: 0.9 }));
  court.rotation.x = -Math.PI / 2; court.position.set(-40, 0.07, 280); G.scene.add(court);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  pole.position.set(-40, 2, 276); G.scene.add(pole);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  board.position.set(-40, 4.2, 276); G.scene.add(board);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 16), new THREE.MeshStandardMaterial({ color: 0xff5f1a, metalness: 0.6, roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(-40, 3.9, 276.6); G.scene.add(rim);
  G.court = { x: -40, z: 280, hoop: new THREE.Vector3(-40, 3.9, 276.6), ball: null };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe87a2a, roughness: 0.8 }));
  ball.position.set(-40, 0.3, 282); G.scene.add(ball);
  G.court.ball = ball;
}
export function nearestPackage(G) {
  const p = G.player;
  for (const pk of G.packages) if (!pk.got && Math.hypot(pk.x - p.x, pk.z - p.z) < 2.5) return pk;
  return null;
}
export function collectPackage(G, pk) {
  pk.got = true; G.scene.remove(pk.mesh);
  G.player.cash += 150; G.player.stats.packages++;
  G.audio.cash(); G.hud.toast('HIDDEN PACKAGE · +$150 (' + G.player.stats.packages + ' / 12)');
}
export function openGarage(G) {
  const v = G.player.vehicle;
  if (!v) return;
  G.state = 'garage';
  const list = document.getElementById('garage-upgrades');
  list.innerHTML = '';
  document.getElementById('garage-car').innerHTML = '<b>' + v.name + '</b> · CONDITION ' + Math.round(v.condition) + '% · ' + (v.upgrades.engine ? 'STAGE 2 ✓ ' : '') + (v.upgrades.armor ? 'ARMOUR ✓ ' : '') + (v.upgrades.nitro ? 'NITRO ✓' : '');
  for (const u of GARAGE_UPGRADES) {
    const owned = u.id === 'engine' ? v.upgrades.engine : u.id === 'armor' ? v.upgrades.armor : u.id === 'nitro' ? v.upgrades.nitro : u.id === 'jetpack' ? G.player.jetpack : false;
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = '<span>' + u.name + (owned ? ' <span class="owned">OWNED</span>' : '') + '</span><span class="price">' + fmtCash(u.price) + '</span>';
    div.onclick = () => {
      document.querySelectorAll('#garage-upgrades .item').forEach((e) => e.classList.remove('sel'));
      div.classList.add('sel');
      document.getElementById('garage-desc').textContent = u.desc;
      G.garageSel = u;
    };
    div.ondblclick = () => buyGarage(G, u);
    list.appendChild(div);
  }
  const wl = document.getElementById('garage-weapons');
  wl.innerHTML = '';
  for (const [key, w] of Object.entries(WEAPONS)) {
    const owned = G.player.owned[key];
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = '<span>' + w.name + (owned ? ' <span class="owned">OWNED</span>' : '') + '</span><span class="price">' + fmtCash(w.price) + '</span>';
    div.onclick = () => {
      document.querySelectorAll('#garage-weapons .item').forEach((e) => e.classList.remove('sel'));
      div.classList.add('sel');
      document.getElementById('garage-desc').textContent = w.name + ' — ' + w.dmg + ' damage, ' + w.mag + '-round mag' + (w.auto ? ', full auto' : ', semi-auto') + '.';
      G.garageSel = { id: 'w:' + key };
    };
    div.ondblclick = () => buyGarage(G, { id: 'w:' + key });
    wl.appendChild(div);
  }
  document.getElementById('garage').classList.add('on');
  G.audio.click();
}
export function buyGarage(G, u) {
  const v = G.player.vehicle, p = G.player;
  if (!u) return;
  if (u.id.startsWith('w:')) {
    const key = u.id.slice(2), w = WEAPONS[key];
    if (p.owned[key]) { G.hud.toast('ALREADY OWNED'); return; }
    if (p.cash < w.price) { G.hud.toast('NOT ENOUGH CASH'); return; }
    p.cash -= w.price; p.owned[key] = true; p.ammo[key] = [w.mag, w.mag * 4];
    G.audio.cash(); G.hud.toast(w.name + ' BOUGHT');
    openGarage(G); return;
  }
  const owned = u.id === 'engine' ? v.upgrades.engine : u.id === 'armor' ? v.upgrades.armor : u.id === 'nitro' ? v.upgrades.nitro : u.id === 'jetpack' ? p.jetpack : false;
  if (owned && u.id !== 'repair' && u.id !== 'respray') { G.hud.toast('ALREADY INSTALLED'); return; }
  if (p.cash < u.price) { G.hud.toast('NOT ENOUGH CASH'); return; }
  p.cash -= u.price;
  if (u.id === 'repair') { v.health = 100; v.condition = 100; }
  else if (u.id === 'respray') { const c = [0xd94f3d, 0x2f6fd9, 0xe8a13d, 0x3da85e, 0xff5fa2, 0x37e6ff][(Math.random() * 6) | 0]; v.mesh.children[0].material = v.mesh.children[0].material.clone(); v.mesh.children[0].material.color.setHex(c); v.color = c; }
  else if (u.id === 'engine') v.upgrades.engine = 1;
  else if (u.id === 'armor') v.upgrades.armor = 1;
  else if (u.id === 'nitro') v.upgrades.nitro = 1;
  else if (u.id === 'jetpack') p.jetpack = true;
  G.audio.cash(); G.hud.toast(u.name + ' — DONE');
  openGarage(G);
}
export function openShop(G) {
  G.state = 'shop';
  const wl = document.getElementById('shop-weapons');
  wl.innerHTML = '';
  for (const [key, w] of Object.entries(WEAPONS)) {
    const owned = G.player.owned[key];
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = '<span>' + w.name + (owned ? ' <span class="owned">OWNED</span>' : '') + '</span><span class="price">' + fmtCash(w.price) + '</span>';
    div.onclick = () => {
      document.querySelectorAll('#shop-weapons .item').forEach((e) => e.classList.remove('sel'));
      div.classList.add('sel');
      document.getElementById('shop-desc').textContent = w.name + ' — ' + w.dmg + ' damage, ' + w.mag + '-round mag' + (w.auto ? ', full auto' : ', semi-auto') + '.';
      G.shopSel = { id: 'w:' + key };
    };
    div.ondblclick = () => buyShop(G, { id: 'w:' + key });
    wl.appendChild(div);
  }
  const gl = document.getElementById('shop-gear');
  gl.innerHTML = '';
  const gear = [
    { id: 'ammo', name: 'AMMO — ALL GUNS', price: 200, desc: 'A full top-up for every gun you own.' },
    { id: 'armor', name: 'BODY ARMOUR', price: 350, desc: '+50 armour. Absorbs bullets before your health does.' },
  ];
  for (const g of gear) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = '<span>' + g.name + '</span><span class="price">' + fmtCash(g.price) + '</span>';
    div.onclick = () => {
      document.querySelectorAll('#shop-gear .item').forEach((e) => e.classList.remove('sel'));
      div.classList.add('sel');
      document.getElementById('shop-desc').textContent = g.desc;
      G.shopSel = g;
    };
    div.ondblclick = () => buyShop(G, g);
    gl.appendChild(div);
  }
  document.getElementById('shop').classList.add('on');
  G.audio.click();
}
export function buyShop(G, g) {
  const p = G.player;
  if (!g) return;
  if (g.id.startsWith('w:')) {
    const key = g.id.slice(2), w = WEAPONS[key];
    if (p.owned[key]) { G.hud.toast('ALREADY OWNED'); return; }
    if (p.cash < w.price) { G.hud.toast('NOT ENOUGH CASH'); return; }
    p.cash -= w.price; p.owned[key] = true; p.ammo[key] = [w.mag, w.mag * 4];
  } else if (g.id === 'ammo') {
    if (p.cash < 200) { G.hud.toast('NOT ENOUGH CASH'); return; }
    p.cash -= 200;
    for (const k of Object.keys(p.owned)) if (p.owned[k]) p.ammo[k][1] += WEAPONS[k].mag * 4;
  } else if (g.id === 'armor') {
    if (p.cash < 350) { G.hud.toast('NOT ENOUGH CASH'); return; }
    p.cash -= 350; p.armor = Math.min(100, p.armor + 50);
  }
  G.audio.cash(); G.hud.toast('BOUGHT');
  openShop(G);
}
const SYMBOLS = ['🍒', '⭐', '💎', '🍋', '🔔', '7️⃣'];
export function spinSlots(G) {
  const p = G.player;
  if (p.cash < 50) { document.getElementById('casino-msg').textContent = 'Not enough cash — one spin is $50.'; return; }
  p.cash -= 50;
  document.getElementById('casino-cash').textContent = fmtCash(p.cash);
  const reels = ['slot1', 'slot2', 'slot3'].map((id) => document.getElementById(id));
  const final = [0, 1, 2].map(() => SYMBOLS[(Math.random() * SYMBOLS.length) | 0]);
  G.audio.coin();
  reels.forEach((el, i) => {
    let n = 0;
    const iv = setInterval(() => {
      el.textContent = SYMBOLS[(Math.random() * SYMBOLS.length) | 0];
      if (++n > 6 + i * 6) { clearInterval(iv); el.textContent = final[i]; }
    }, 70);
  });
  setTimeout(() => {
    let win = 0;
    if (final[0] === final[1] && final[1] === final[2]) win = final[0] === '7️⃣' ? 1250 : 500;
    else if (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]) win = 100;
    if (win > 0) { p.cash += win; G.audio.cash(); document.getElementById('casino-msg').textContent = 'YOU WIN ' + fmtCash(win) + '!'; }
    else document.getElementById('casino-msg').textContent = 'No luck this spin. The Crown thanks you.';
    document.getElementById('casino-cash').textContent = fmtCash(p.cash);
  }, 1500);
}
export function startFishing(G) {
  const p = G.player;
  const fx = p.x + Math.sin(p.heading) * 7, fz = p.z + Math.cos(p.heading) * 7;
  const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff3b4d, emissive: 0xff3b4d, emissiveIntensity: 0.6 }));
  bobber.position.set(fx, 0.7, fz);
  G.scene.add(bobber);
  G.activity.mode = 'fish';
  G.activity.fish = { bobber, state: 'wait', t: 2 + Math.random() * 3, biteT: 0, reelT: 0, tension: 50, pull: 0 };
  G.audio.splash();
  G.hud.toast('LINE CAST — wait for the bite…');
}
export function updateFishing(G, dt, inp) {
  const f = G.activity.fish;
  if (!f) return;
  f.bobber.position.y = 0.7 + Math.sin(G.time * 2) * 0.06;
  if (f.state === 'wait') {
    f.t -= dt;
    if (f.t <= 0) { f.state = 'bite'; f.biteT = 1.2; G.audio.bite(); G.hud.toast('STRIKE! PRESS E!'); }
  } else if (f.state === 'bite') {
    f.biteT -= dt;
    f.bobber.position.y = 0.45;
    if (f.biteT <= 0) { endFishing(G, 'The fish got away…'); }
  } else if (f.state === 'reel') {
    f.pull = Math.sin(G.time * 3.1) * 18 + Math.sin(G.time * 7.7) * 10;
    f.tension += (inp.jump ? 34 : -16) * dt + f.pull * dt;
    f.tension = clamp(f.tension, 0, 100);
    f.reelT += dt;
    if (f.tension >= 100) { endFishing(G, 'Line snapped! Too much tension.'); return; }
    if (f.tension <= 0) { endFishing(G, 'Line went slack — the fish escaped.'); return; }
    if (f.reelT > 8) {
      let r = Math.random(), acc = 0, pick = FISH[0];
      for (const fi of FISH) { acc += fi.w; if (r <= acc) { pick = fi; break; } }
      G.player.cash += pick.price; G.player.stats.fish++;
      G.audio.cash(); G.hud.toast('CAUGHT A ' + pick.name.toUpperCase() + ' · +' + fmtCash(pick.price));
      endFishing(G, null);
    }
  }
}
export function fishStrike(G) {
  const f = G.activity.fish;
  if (f && f.state === 'bite') { f.state = 'reel'; G.hud.toast('REELING — hold SPACE, keep tension mid!'); }
}
function endFishing(G, msg) {
  if (G.activity.fish) G.scene.remove(G.activity.fish.bobber);
  G.activity.fish = null; G.activity.mode = null;
  if (msg) G.hud.toast(msg);
}
export function startBasketball(G) {
  G.activity.mode = 'basket';
  G.activity.basket = { score: 0, t: 60, power: 0, charging: false, ball: null, ballV: null, shot: false };
  G.hud.toast('STREET BALL — 60 seconds, most baskets wins!');
}
export function updateBasketball(G, dt, inp) {
  const b = G.activity.basket;
  if (!b) return;
  b.t -= dt;
  const c = G.court, p = G.player;
  if (b.t <= 0) {
    G.player.stats.baskets = Math.max(G.player.stats.baskets, b.score);
    G.player.cash += b.score * 20;
    G.audio.cash(); G.hud.toast('FULL TIME — ' + b.score + ' baskets · +' + fmtCash(b.score * 20));
    G.activity.basket = null; G.activity.mode = null;
    return;
  }
  if (b.shot && b.ball) {
    b.ballV.y -= 14 * dt;
    b.ball.position.addScaledVector(b.ballV, dt);
    if (b.ball.position.y <= 0.28) {
      const d = Math.hypot(b.ball.position.x - c.hoop.x, b.ball.position.z - c.hoop.z);
      b.shot = false;
      if (d < 0.9) { b.score++; G.audio.swish(); G.hud.toast('SWISH! ' + b.score + ' PTS'); }
      else G.audio.bounce();
    }
    return;
  }
  if (inp.jump) { b.charging = true; b.power = clamp(b.power + dt * 1.4, 0, 1); }
  else if (b.charging) {
    b.charging = false;
    const d = Math.hypot(p.x - c.hoop.x, p.z - c.hoop.z);
    const dir = new THREE.Vector3(c.hoop.x - p.x, 0, c.hoop.z - p.z).normalize();
    const power = 7 + b.power * 7 + d * 0.45;
    b.ball = c.ball;
    b.ball.position.set(p.x, 1.4, p.z);
    b.ballV = new THREE.Vector3(dir.x * power * 0.7, 6 + b.power * 3.5, dir.z * power * 0.7);
    b.shot = true;
    b.power = 0;
    G.audio.bounce();
  }
  G.hud.setMission('STREET BALL', 'Score: ' + b.score + ' · ' + Math.ceil(b.t) + 's', b.charging ? 'POWER ' + Math.round(b.power * 100) + '%' : 'Hold SPACE to charge, release to shoot');
}
export function startCourier(G) {
  const drops = [[280, -160], [-280, 160]];
  G.activity.courier = { drops, i: 0, timer: 120 };
  G.hud.toast('COURIER — 2 drops, 120 seconds, $300');
}
export function updateCourier(G, dt) {
  const c = G.activity.courier;
  if (!c) return;
  c.timer -= dt;
  if (c.timer <= 0) { G.activity.courier = null; G.hud.toast('COURIER LATE — no pay'); return; }
  const [dx, dz] = c.drops[c.i];
  if (Math.hypot(G.player.x - dx, G.player.z - dz) < 12) {
    c.i++;
    G.audio.pickup();
    if (c.i >= c.drops.length) {
      G.player.cash += 300; G.activity.courier = null;
      G.audio.cash(); G.hud.toast('COURIER DONE · +$300');
    }
  }
}
export function updateActivities(G, dt, inp) {
  if (G.activity.mode === 'fish') updateFishing(G, dt, inp);
  if (G.activity.mode === 'basket') updateBasketball(G, dt, inp);
  updateCourier(G, dt);
  for (const pk of G.packages) if (!pk.got) { pk.mesh.rotation.y += dt; pk.mesh.position.y = 0.6 + Math.sin(G.time * 2 + pk.x) * 0.15; }
}
