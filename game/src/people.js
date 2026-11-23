import * as THREE from 'three';
import { mulberry32, clamp, lerp, angLerp, angDiff, dist2, TAU } from './utils.js';
import { makePersonMesh, makeJetpackMesh } from './vehicles.js';

const SHIRTS = [0xff5fa2, 0x37e6ff, 0xffd23e, 0x3da85e, 0xd9d9d9, 0xff8a5c, 0x7a4fd9, 0x2f6fd9];
const PANTS = [0x22242c, 0x3a4a6b, 0x6b4a3a, 0x2c3a2c, 0x555a66];
const SKINS = [0xf2c89b, 0xc98d5f, 0x8a5a3b, 0xf7d7b5, 0x6e4426];
const HAIRS = [0x181410, 0x3a2a1a, 0x6e6e6e, 0xd9b380, 0x222222];

export function makePlayer(G) {
  const mesh = makePersonMesh(0x37e6ff, 0x22242c, 0xf2c89b, 0x181410);
  mesh.position.set(0, 0, 20);
  G.scene.add(mesh);
  const p = {
    mesh, x: 0, z: 20, heading: 0, speed: 0, walkPhase: 0,
    health: 100, armor: 0, cash: 500, respect: 0, respectLevel: 0,
    onFoot: true, vehicle: null, jetpack: false, jetFuel: 100, vy: 0, y: 0,
    weapon: 'pistol', ammo: { pistol: [12, 120], smg: [0, 0], shotgun: [0, 0], rifle: [0, 0] },
    owned: { pistol: true }, stats: { jobs: 0, carsStolen: 0, starsLost: 0, knockouts: 0, raceWins: 0, bestLap: 0, kmDriven: 0, packages: 0, fish: 0, baskets: 0, explosions: 0 },
  };
  G.player = p;
  return p;
}
export function spawnPeds(G) {
  const rng = mulberry32(9001);
  G.peds = [];
  for (let i = 0; i < 60; i++) {
    const shirt = SHIRTS[(rng() * SHIRTS.length) | 0], pants = PANTS[(rng() * PANTS.length) | 0];
    const mesh = makePersonMesh(shirt, pants, SKINS[(rng() * SKINS.length) | 0], HAIRS[(rng() * HAIRS.length) | 0]);
    const x = -320 + rng() * 640, z = -320 + rng() * 560;
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({ mesh, x, z, heading: rng() * TAU, speed: 1.1 + rng() * 0.9, phase: rng() * TAU, state: 'walk', tx: x, tz: z, wait: 0, fleeT: 0, down: 0, pair: -1 });
  }
  for (let i = 0; i < 8; i++) {
    const spots = [[-20, -20], [20, 20], [-8, 268], [30, 290], [-12, -100], [12, -140], [-30, 60], [30, -60]];
    const [bx, bz] = spots[i];
    for (let j = 0; j < 2; j++) {
      const mesh = makePersonMesh(SHIRTS[(rng() * SHIRTS.length) | 0], PANTS[(rng() * PANTS.length) | 0], SKINS[(rng() * SKINS.length) | 0], HAIRS[(rng() * HAIRS.length) | 0]);
      const x = bx + j * 1.4 - 0.7, z = bz;
      mesh.position.set(x, 0, z); mesh.rotation.y = j === 0 ? Math.PI / 2 : -Math.PI / 2;
      G.scene.add(mesh);
      const ped = { mesh, x, z, heading: mesh.rotation.y, speed: 0, phase: rng() * TAU, state: 'chat', tx: x, tz: z, wait: 0, fleeT: 0, down: 0, pair: i * 2 + (1 - j) };
      G.peds.push(ped);
    }
  }
}
function nearestWaypoint(G, ped) {
  const xs = [-320, -240, -160, -80, 0, 80, 160, 240, 320];
  let bx = xs[0], bd = 1e9;
  for (const s of xs) { const d = Math.abs(ped.x - s); if (d < bd) { bd = d; bx = s; } }
  let bz = xs[0]; bd = 1e9;
  for (const s of xs) { const d = Math.abs(ped.z - s); if (d < bd) { bd = d; bz = s; } }
  const alongX = Math.random() < 0.5;
  if (alongX) return [bx + (Math.random() < 0.5 ? -9 : 9), ped.z + (Math.random() - 0.5) * 120];
  return [ped.x + (Math.random() - 0.5) * 120, bz + (Math.random() < 0.5 ? -9 : 9)];
}
export function updatePeds(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      ped.mesh.rotation.x = ped.down > 0 ? -Math.PI / 2 * clamp(ped.down, 0, 1) : 0;
      if (ped.down <= 0) { ped.mesh.rotation.x = 0; ped.state = 'flee'; ped.fleeT = 4; }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - p.x, dz = ped.z - p.z, d = Math.hypot(dx, dz) || 1;
      ped.heading = Math.atan2(dx / d, dz / d);
      ped.x += Math.sin(ped.heading) * 3.4 * dt; ped.z += Math.cos(ped.heading) * 3.4 * dt;
      ped.phase += dt * 11;
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else if (ped.state === 'chat') {
      ped.phase += dt * 1.5;
      ped.mesh.position.y = Math.sin(ped.phase) * 0.02;
    } else {
      if (ped.wait > 0) { ped.wait -= dt; }
      else {
        const dx = ped.tx - ped.x, dz = ped.tz - ped.z, d = Math.hypot(dx, dz);
        if (d < 2) { const [nx, nz] = nearestWaypoint(G, ped); ped.tx = nx; ped.tz = nz; if (Math.random() < 0.25) ped.wait = 1 + Math.random() * 3; }
        else {
          ped.heading = angLerp(ped.heading, Math.atan2(dx, dz), clamp(dt * 4, 0, 1));
          ped.x += Math.sin(ped.heading) * ped.speed * dt;
          ped.z += Math.cos(ped.heading) * ped.speed * dt;
          ped.phase += dt * 6 * ped.speed;
        }
      }
    }
    const [cx, cz] = G.city.collide(ped.x, ped.z, 0.5);
    ped.x = cx; ped.z = cz;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
    const L = ped.mesh.userData.limbs, s = Math.sin(ped.phase);
    if (ped.state === 'walk' || ped.state === 'flee') {
      L.legL.rotation.x = s * 0.6; L.legR.rotation.x = -s * 0.6;
      L.armL.rotation.x = -s * 0.5; L.armR.rotation.x = s * 0.5;
    } else {
      L.legL.rotation.x = 0; L.legR.rotation.x = 0;
      L.armL.rotation.x = Math.sin(ped.phase * 0.7) * 0.25; L.armR.rotation.x = -Math.sin(ped.phase * 0.7) * 0.25;
    }
  }
}
export function knockPed(G, ped, byCar) {
  if (ped.down > 0) return;
  ped.down = 1.4;
  G.player.stats.knockouts++;
  G.addWanted(1, 'ped down');
  G.audio.crash();
  if (byCar) G.hud.toast('PEDESTRIAN DOWN — WANTED +1');
}
export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (dist2(ped.x, ped.z, x, z) < radius * radius && ped.state !== 'flee') { ped.state = 'flee'; ped.fleeT = 5; }
  }
}
export function updatePlayerOnFoot(G, dt, inp) {
  const p = G.player;
  const camYaw = G.camYaw;
  let mx = 0, mz = 0;
  if (inp.fwd) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
  if (inp.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
  if (inp.left) { mx += Math.sin(camYaw - Math.PI / 2); mz += Math.cos(camYaw - Math.PI / 2); }
  if (inp.right) { mx += Math.sin(camYaw + Math.PI / 2); mz += Math.cos(camYaw + Math.PI / 2); }
  const ml = Math.hypot(mx, mz);
  const run = inp.sprint ? 7.5 : 4.2;
  if (ml > 0) {
    mx /= ml; mz /= ml;
    p.heading = angLerp(p.heading, Math.atan2(mx, mz), clamp(dt * 10, 0, 1));
    p.x += mx * run * dt; p.z += mz * run * dt;
    p.speed = run; p.walkPhase += dt * run * 1.6;
    p.stats.kmDriven += run * dt / 1000;
  } else { p.speed = 0; p.walkPhase = lerp(p.walkPhase, Math.round(p.walkPhase / Math.PI) * Math.PI, clamp(dt * 8, 0, 1)); }
  if (inp.jump && p.y === 0 && !p.jetpack) { p.vy = 7.5; }
  if (inp.jump && p.y > 0.2 && p.jetpack && p.jetFuel > 0) {
    p.vy = Math.min(p.vy + 22 * dt, 6);
    p.jetFuel -= 22 * dt;
    if (Math.random() < 0.6) G.spawnSmoke(p.x, p.y + 0.4, p.z, 0.8, 0.5, 0xffb36b);
    if (Math.random() < 0.3) G.audio.jetpack();
  } else p.jetFuel = Math.min(100, p.jetFuel + 10 * dt);
  p.vy -= 22 * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; }
  const [cx, cz] = G.city.collide(p.x, p.z, 0.5);
  p.x = cx; p.z = cz;
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.heading;
  const L = p.mesh.userData.limbs, s = Math.sin(p.walkPhase);
  if (p.speed > 0) { L.legL.rotation.x = s * 0.7; L.legR.rotation.x = -s * 0.7; L.armL.rotation.x = -s * 0.6; L.armR.rotation.x = s * 0.6; }
  else { L.legL.rotation.x = 0; L.legR.rotation.x = 0; L.armL.rotation.x = 0; L.armR.rotation.x = 0; }
  if (p.jetpack && !p.mesh.userData.jetpackMesh) {
    const jp = makeJetpackMesh();
    jp.position.set(0, 1.25, -0.22);
    p.mesh.add(jp);
    p.mesh.userData.jetpackMesh = jp;
  }
}
