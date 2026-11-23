import * as THREE from 'three';
import { clamp, lerp, angLerp, angDiff, dist2, TAU } from './utils.js';
import { makePersonMesh, createVehicle, createHeli, damageVehicle } from './vehicles.js';

const LADDER = [
  { foot: 0, cars: 0, heli: false, block: false },
  { foot: 2, cars: 0, heli: false, block: false },
  { foot: 2, cars: 2, heli: false, block: false },
  { foot: 2, cars: 4, heli: false, block: true },
  { foot: 2, cars: 5, heli: true, block: true },
  { foot: 3, cars: 6, heli: true, block: true },
];
const TACTICS = ['FLANKING', 'CLOSING', 'RAMMING', 'SPOTLIGHT', 'ROADBLOCK', 'FIRING'];
let unitNo = 7;

export function initPolice(G) {
  G.wanted = { stars: 0, seen: false, seenT: 0, decayT: 0, bustT: 0 };
  G.police = { foot: [], cars: [], heli: null, block: [] };
}
export function addWanted(G, n, reason) {
  const w = G.wanted;
  const before = w.stars;
  w.stars = clamp(w.stars + n, 0, 5);
  w.seen = true; w.seenT = 0; w.decayT = 0;
  if (w.stars > before) G.hud.toast('WANTED ' + '★'.repeat(w.stars));
}
// Snap a point onto the nearest street so units never spawn inside a building.
function snapToRoad(G, x, z) {
  const { STREETS } = G;
  let bx = STREETS[0], bd = 1e9;
  for (const s of STREETS) { const d = Math.abs(x - s); if (d < bd) { bd = d; bx = s; } }
  let bz = STREETS[0]; bd = 1e9;
  for (const s of STREETS) { const d = Math.abs(z - s); if (d < bd) { bd = d; bz = s; } }
  if (Math.abs(x - bx) <= Math.abs(z - bz)) return [bx, z];
  return [x, bz];
}
function spawnFootCop(G) {
  const mesh = makePersonMesh(0x1a3a6b, 0x14161c, 0xc98d5f, 0x14161c);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), new THREE.MeshStandardMaterial({ color: 0x0e2a52 }));
  cap.position.y = 1.8; mesh.add(cap);
  const a = Math.random() * TAU, d = 45 + Math.random() * 20;
  let x = G.player.x + Math.sin(a) * d, z = G.player.z + Math.cos(a) * d;
  [x, z] = snapToRoad(G, x, z);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const cop = { mesh, x, z, heading: 0, phase: 0, closeT: 0, name: 'UNIT ' + (unitNo++), tactic: 'CLOSING' };
  G.police.foot.push(cop);
  return cop;
}
function spawnPoliceCar(G) {
  const a = Math.random() * TAU, d = 55 + Math.random() * 25;
  let x = G.player.x + Math.sin(a) * d, z = G.player.z + Math.cos(a) * d;
  [x, z] = snapToRoad(G, x, z);
  const v = createVehicle(G, 'police', x, z, Math.random() * TAU, { police: true, name: 'Bay Patrol' });
  const unit = { v, name: 'UNIT ' + (unitNo++), tactic: 'FLANKING', pitT: 0, shootT: 0 };
  G.police.cars.push(unit);
  return unit;
}
export function updatePolice(G, dt) {
  const w = G.wanted, p = G.player;
  const tier = LADDER[w.stars];
  while (G.police.foot.length < tier.foot) spawnFootCop(G);
  while (G.police.cars.length < tier.cars) spawnPoliceCar(G);
  if (tier.heli && !G.police.heli) {
    const h = createHeli(G, p.x + 20, p.z - 20, 46, true);
    G.police.heli = { v: h, name: 'AIR ONE', tactic: 'SPOTLIGHT' };
  }
  if (!tier.heli && G.police.heli) { removeVehicle(G, G.police.heli.v); G.police.heli = null; }
  if (tier.block && G.police.block.length === 0 && p.vehicle) {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const bx = p.x + fx * 55, bz = p.z + fz * 55;
    for (const side of [-1, 1]) {
      const v = createVehicle(G, 'police', bx + Math.cos(p.heading) * side * 5, bz - Math.sin(p.heading) * side * 5, p.heading + Math.PI / 2, { police: true, name: 'Bay Patrol' });
      v.parked = true;
      G.police.block.push(v);
    }
  }
  if (!tier.block) {
    for (const v of G.police.block) removeVehicle(G, v);
    G.police.block = [];
  }
  let seen = false;
  for (const c of G.police.foot) if (dist2(c.x, c.z, p.x, p.z) < 45 * 45) seen = true;
  for (const u of G.police.cars) if (dist2(u.v.x, u.v.z, p.x, p.z) < 60 * 60) seen = true;
  if (G.police.heli) seen = true;
  w.seen = seen;
  if (seen) { w.seenT = 0; w.decayT = 0; }
  else {
    w.seenT += dt;
    if (w.seenT > 12 && w.stars > 0) {
      w.decayT += dt;
      if (w.decayT > 8) { w.stars--; w.decayT = 0; p.stats.starsLost++; G.hud.toast('HEAT COOLING — ' + w.stars + '★'); }
    }
  }
  for (const c of G.police.foot) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1;
    c.heading = angLerp(c.heading, Math.atan2(dx, dz), clamp(dt * 5, 0, 1));
    const spd = p.onFoot ? 6.6 : 6.6;
    c.x += Math.sin(c.heading) * spd * dt; c.z += Math.cos(c.heading) * spd * dt;
    c.phase += dt * 10;
    const [cx, cz] = G.city.collide(c.x, c.z, 0.5);
    c.x = cx; c.z = cz;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.heading;
    const L = c.mesh.userData.limbs, s = Math.sin(c.phase);
    L.legL.rotation.x = s * 0.7; L.legR.rotation.x = -s * 0.7;
    L.armL.rotation.x = -s * 0.6; L.armR.rotation.x = s * 0.6;
    if (p.onFoot && d < 2.4) {
      c.closeT += dt;
      if (c.closeT > 2.2) { G.bustPlayer(); return; }
    } else c.closeT = 0;
    if (w.stars >= 3 && p.onFoot && d < 38 && d > 6) {
      c.shootT = (c.shootT || 0) - dt;
      if (c.shootT <= 0) {
        c.shootT = 0.9 + Math.random() * 0.7;
        G.audio.shot();
        if (Math.random() < 0.16) G.hurtPlayer(6, 'shot');
      }
    }
  }
  for (const u of G.police.cars) {
    const v = u.v;
    if (v.dead) continue;
    const tx = p.vehicle ? p.vehicle.x : p.x, tz = p.vehicle ? p.vehicle.z : p.z;
    const pvx = p.vehicle ? Math.sin(p.vehicle.heading) * p.vehicle.speed : 0;
    const pvz = p.vehicle ? Math.cos(p.vehicle.heading) * p.vehicle.speed : 0;
    const px = tx + pvx * 0.7, pz = tz + pvz * 0.7;
    const dx = px - v.x, dz = pz - v.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx, dz);
    const turn = clamp(angDiff(v.heading, want), -1, 1);
    v.heading += turn * clamp(dt * 2.4, 0, 1);
    const aggression = 1 + w.stars * 0.06;
    const target = Math.min(v.top * aggression, d < 12 ? 26 : v.top * aggression);
    v.speed = lerp(v.speed, target, clamp(dt * 1.8, 0, 1));
    const alongside = d < 9 && Math.abs(angDiff(v.heading, p.vehicle ? p.vehicle.heading : 0)) < 0.6;
    let nx = v.x + Math.sin(v.heading) * v.speed * dt, nz = v.z + Math.cos(v.heading) * v.speed * dt;
    if (alongside && p.vehicle) {
      u.tactic = 'RAMMING';
      const px2 = p.vehicle.x - Math.sin(p.vehicle.heading) * 2, pz2 = p.vehicle.z - Math.cos(p.vehicle.heading) * 2;
      nx = lerp(nx, px2, clamp(dt * 2.5, 0, 1)); nz = lerp(nz, pz2, clamp(dt * 2.5, 0, 1));
      if (d < 4.5) {
        damageVehicle(G, p.vehicle, 14 * dt * 4);
        p.vehicle.speed *= 0.94;
        if (Math.random() < 0.3) G.audio.crash();
      }
    } else if (d > 30) u.tactic = 'FLANKING';
    else u.tactic = 'CLOSING';
    [nx, nz] = G.city.collide(nx, nz, 1.6);
    v.x = nx; v.z = nz;
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;
    if (p.vehicle && p.vehicle.speed < 2.5 && d < 5) {
      w.bustT += dt;
      if (w.bustT > 3) { G.bustPlayer(); return; }
    } else w.bustT = 0;
  }
  if (G.police.heli) {
    const h = G.police.heli.v;
    h.x = lerp(h.x, p.x + 12, clamp(dt * 0.8, 0, 1));
    h.z = lerp(h.z, p.z - 12, clamp(dt * 0.8, 0, 1));
    h.y = lerp(h.y, 44, clamp(dt * 0.5, 0, 1));
    h.heading += dt * 0.4;
    h.mesh.position.set(h.x, h.y, h.z);
    h.mesh.rotation.y = h.heading;
    if (h.rotor) h.rotor.rotation.y += dt * 22;
    if (h.tailRotor) h.tailRotor.rotation.z += dt * 30;
    if (Math.random() < dt * 0.5) G.audio.heli();
  }
  if (w.stars === 0) {
    for (const c of G.police.foot) G.scene.remove(c.mesh);
    G.police.foot = [];
    for (const u of G.police.cars) removeVehicle(G, u.v);
    G.police.cars = [];
  }
}
export function removeVehicle(G, v) {
  G.scene.remove(v.mesh);
  const i = G.vehicles.indexOf(v);
  if (i >= 0) G.vehicles.splice(i, 1);
}
export function patrolList(G) {
  const out = [];
  for (const c of G.police.foot) out.push({ name: c.name, dist: Math.round(Math.hypot(c.x - G.player.x, c.z - G.player.z)), tactic: 'CLOSING' });
  for (const u of G.police.cars) out.push({ name: u.name, dist: Math.round(Math.hypot(u.v.x - G.player.x, u.v.z - G.player.z)), tactic: u.tactic });
  if (G.police.heli) out.push({ name: 'AIR ONE', dist: Math.round(Math.hypot(G.police.heli.v.x - G.player.x, G.police.heli.v.z - G.player.z)), tactic: 'SPOTLIGHT' });
  for (const v of G.police.block) out.push({ name: 'ROADBLOCK', dist: Math.round(Math.hypot(v.x - G.player.x, v.z - G.player.z)), tactic: 'ROADBLOCK' });
  return out.slice(0, 6);
}
