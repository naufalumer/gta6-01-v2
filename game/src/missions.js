import * as THREE from 'three';
import { clamp, lerp, angLerp, angDiff, dist2, fmtCash, fmtTime } from './utils.js';
import { makePersonMesh, createVehicle, damageVehicle } from './vehicles.js';
import { addWanted } from './police.js';

export const CREW = {
  rico: { name: 'RICO', role: 'fixer', color: '#ffd23e', initial: 'R' },
  lena: { name: 'LENA', role: 'planner', color: '#37e6ff', initial: 'L' },
  tank: { name: 'TANK', role: 'muscle', color: '#ff5fa2', initial: 'T' },
  mira: { name: 'MIRA', role: 'driver', color: '#7fe3a8', initial: 'M' },
  kane: { name: 'KANE', role: 'syndicate', color: '#ff3b4d', initial: 'K' },
  dax: { name: 'DAX', role: 'mechanic', color: '#e8a13d', initial: 'D' },
};
export const GARAGE_POS = { x: -8, z: -40 };
export const SAFEHOUSE_POS = { x: -160, z: 200 };
export const CASINO_POS = { x: 10, z: 40 };
export const RACE_START = { x: -160, z: -160 };
const RACE_CPS = [[-160, -160], [0, -160], [160, -160], [160, 0], [160, 160], [0, 160], [-160, 160], [-160, 0]];
const DROPS = [[280, -160], [-280, 160], [80, -280], [-160, -280], [280, 160]];

function marker(G, x, z, color = 0xffd23e) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 20; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
  const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), new THREE.MeshBasicMaterial({ color }));
  dia.position.y = 6; g.add(dia);
  g.position.set(x, 0, z);
  G.scene.add(g);
  return { group: g, x, z, ring, dia };
}
export function setMarker(G, x, z, color) {
  clearMarker(G);
  G.marker = marker(G, x, z, color);
}
export function clearMarker(G) {
  if (G.marker) { G.scene.remove(G.marker.group); G.marker = null; }
}
function say(G, who, text) {
  const c = CREW[who];
  G.hud.say(c.name, c.role, text, c.color, c.initial);
}
export function spawnGunmen(G, positions, hp = 60) {
  const out = [];
  for (const [x, z] of positions) {
    const mesh = makePersonMesh(0x1a1a22, 0x14161c, 0xc98d5f, 0x181410);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    out.push({ mesh, x, z, hp, maxHp: hp, shootT: 1 + Math.random(), alive: true, phase: Math.random() * 6 });
  }
  G.enemies.push(...out);
  return out;
}
export function damageEnemy(G, e, dmg) {
  if (!e.alive) return;
  e.hp -= dmg;
  G.audio.shot();
  if (e.hp <= 0) {
    e.alive = false;
    e.mesh.rotation.x = -Math.PI / 2;
    e.mesh.position.y = 0.3;
    G.player.stats.knockouts++;
    setTimeout(() => { G.scene.remove(e.mesh); const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1); }, 4000);
  }
}
function updateEnemies(G, dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
    if (d > 26) { e.mesh.rotation.y = Math.atan2(dx, dz); continue; }
    e.mesh.rotation.y = Math.atan2(dx, dz);
    if (d > 8) { e.x += (dx / d) * 3.2 * dt; e.z += (dz / d) * 3.2 * dt; }
    e.mesh.position.set(e.x, 0, e.z);
    e.phase += dt * 8;
    const L = e.mesh.userData.limbs, s = Math.sin(e.phase);
    L.legL.rotation.x = s * 0.5; L.legR.rotation.x = -s * 0.5;
    e.shootT -= dt;
    if (e.shootT <= 0) {
      e.shootT = 1.1 + Math.random() * 0.9;
      G.audio.shot();
      if (Math.random() < 0.22) {
        if (p.vehicle) damageVehicle(G, p.vehicle, 5);
        else G.hurtPlayer(5, 'shot');
      }
    }
  }
}
const MISSIONS = [
  {
    id: 'first-gear', title: 'FIRST GEAR', payout: 400, respect: 50,
    intro: (G) => { say(G, 'rico', 'Welcome to Azura Bay, kid. First rule: wheels are free if you are fast. Jack a car off the street and bring it to Tideworks Customs.'); setMarker(G, GARAGE_POS.x, GARAGE_POS.z); },
    objective: 'Steal a car, then drive to Tideworks Customs',
    update: (G, dt) => {
      if (!G.player.vehicle) return { progress: '0 / 1 · no car yet' };
      if (dist2(G.player.x, G.player.z, GARAGE_POS.x, GARAGE_POS.z) < 12 * 12) return 'done';
      return { progress: '1 / 1 · car got — get to the garage' };
    },
    done: (G) => { say(G, 'dax', 'Nice wheels. She is yours now, free of charge. Rico likes you already.'); },
  },
  {
    id: 'saltflats-run', title: 'SALTFLATS RUN', payout: 800, respect: 80,
    intro: (G) => { say(G, 'lena', 'Three drops, one clock. Saltflats Port, Old Cannery, Palm Heights. 150 seconds. Drive like the bay is watching — it is.'); G.mission.data.drops = 0; G.mission.timer = 150; setMarker(G, DROPS[0][0], DROPS[0][1]); },
    objective: 'Deliver 3 packages before the clock runs out',
    update: (G, dt) => {
      const m = G.mission;
      m.timer -= dt;
      if (m.timer <= 0) { say(G, 'lena', 'Clock beat you. Come back when your foot is heavier.'); return 'fail'; }
      const [dx, dz] = DROPS[m.data.drops];
      if (dist2(G.player.x, G.player.z, dx, dz) < 12 * 12) {
        m.data.drops++;
        G.audio.pickup();
        if (m.data.drops >= 3) return 'done';
        setMarker(G, DROPS[m.data.drops][0], DROPS[m.data.drops][1]);
      }
      return { progress: m.data.drops + ' / 3 · ' + fmtTime(Math.max(0, m.timer)) + ' left' };
    },
    done: (G) => { say(G, 'lena', 'Three drops, zero excuses. That is how you earn a name here.'); },
  },
  {
    id: 'neon-sprint', title: 'NEON SPRINT', payout: 1500, respect: 150,
    intro: (G) => { say(G, 'mira', 'Street race. Three laps, eight gates, three rivals who think they own Neon Row. Get to the start line and I will count you in.'); setMarker(G, RACE_START.x, RACE_START.z); },
    objective: 'Get to the start line, then win 3 laps',
    update: (G, dt) => {
      const m = G.mission;
      if (!G.race.active) {
        if (dist2(G.player.x, G.player.z, RACE_START.x, RACE_START.z) < 12 * 12 && G.player.vehicle) {
          startRace(G, 3, 'mission');
          return { progress: 'Race starting…' };
        }
        return { progress: 'Get in a car and reach the start line' };
      }
      return null; // race system drives the outcome
    },
    done: (G) => { say(G, 'mira', 'You just out-drove the whole row. Neon Row is yours tonight.'); },
  },
  {
    id: 'harbor-heat', title: 'HARBOR HEAT', payout: 2000, respect: 200,
    intro: (G) => { say(G, 'rico', 'Kane moves product through Saltflats Port in a black Hauler. Take it. The heat will be real — lose it at the safehouse.'); G.mission.data.stage = 0; setMarker(G, 300, -160); },
    objective: 'Steal the Syndicate truck at the port, then reach the safehouse',
    update: (G, dt) => {
      const m = G.mission;
      if (m.data.stage === 0) {
        if (dist2(G.player.x, G.player.z, 300, -160) < 14 * 14) {
          m.data.stage = 1;
          const truck = G.truck;
          say(G, 'tank', 'There she is. Black Hauler, Kane plates. Take it and run!');
          setMarker(G, SAFEHOUSE_POS.x, SAFEHOUSE_POS.z);
          G.hud.toast('STEAL THE HAULER');
          if (truck) truck.parked = true;
        }
        return { progress: 'Reach the port yard' };
      }
      if (m.data.stage === 1) {
        const inTruck = G.player.vehicle && G.player.vehicle.name === 'Syndicate Hauler';
        if (inTruck && !m.data.heat) { m.data.heat = true; addWanted(G, 3, 'stole the hauler'); say(G, 'lena', 'Three stars and climbing. Do NOT stop. Safehouse, now.'); }
        if (m.data.heat && dist2(G.player.x, G.player.z, SAFEHOUSE_POS.x, SAFEHOUSE_POS.z) < 14 * 14) return 'done';
        return { progress: inTruck ? 'Lose the heat — reach the safehouse' : 'Get in the black Hauler' };
      }
      return null;
    },
    done: (G) => { G.wanted.stars = 0; say(G, 'rico', 'Clean. Kane lost a truck and gained a problem: you.'); },
  },
  {
    id: 'high-roller', title: 'HIGH ROLLER', payout: 2500, respect: 250,
    intro: (G) => { say(G, 'mira', 'Pick me up at the Coral Crown. Kane sent a welcome party — four guns on the boulevard. Drive through them and do not stop.'); G.mission.data.stage = 0; setMarker(G, CASINO_POS.x, CASINO_POS.z); },
    objective: 'Pick up Mira, survive the ambush, reach the safehouse',
    update: (G, dt) => {
      const m = G.mission;
      if (m.data.stage === 0) {
        if (dist2(G.player.x, G.player.z, CASINO_POS.x, CASINO_POS.z) < 12 * 12 && G.player.vehicle) {
          m.data.stage = 1;
          say(G, 'mira', 'Go go go — they are on the boulevard!');
          spawnGunmen(G, [[40, -80], [60, -60], [20, -100], [80, -80]]);
          setMarker(G, SAFEHOUSE_POS.x, SAFEHOUSE_POS.z);
        }
        return { progress: 'Pick up Mira at the Coral Crown (in a car)' };
      }
      if (dist2(G.player.x, G.player.z, SAFEHOUSE_POS.x, SAFEHOUSE_POS.z) < 14 * 14) return 'done';
      return { progress: 'Ambush on the boulevard — reach the safehouse' };
    },
    done: (G) => { say(G, 'mira', 'Four guns and we are still breathing. You drive, I ride. Deal?'); },
  },
  {
    id: 'the-kane-job', title: 'THE KANE JOB', payout: 5000, respect: 400,
    intro: (G) => { say(G, 'rico', 'This is it. Kane keeps his ledger in the Old Cannery warehouse. Six guards. Get the ledger, get to the roof, and fly out. The bay is watching.'); G.mission.data.stage = 0; setMarker(G, -320, -80); },
    objective: 'Storm the warehouse, grab the ledger, escape by helicopter',
    update: (G, dt) => {
      const m = G.mission;
      if (m.data.stage === 0) {
        if (dist2(G.player.x, G.player.z, -320, -80) < 16 * 16) {
          m.data.stage = 1;
          spawnGunmen(G, [[-320, -60], [-300, -80], [-340, -80], [-310, -100], [-330, -60], [-320, -110]], 80);
          say(G, 'tank', 'Six guards between you and the ledger. Make it loud.');
          setMarker(G, -320, -80, 0xff3b4d);
        }
        return { progress: 'Reach the Cannery warehouse' };
      }
      if (m.data.stage === 1) {
        const left = G.enemies.filter((e) => e.alive).length;
        if (left === 0) {
          m.data.stage = 2;
          G.audio.cash();
          say(G, 'lena', 'Ledger secured. Roof helipad — the Skyhawk is waiting. Go!');
          setMarker(G, -160, 200);
        }
        return { progress: 'Guards left: ' + left + ' · clear them all' };
      }
      if (m.data.stage === 2) {
        if (G.player.vehicle && G.player.vehicle.kind === 'heli') {
          m.data.stage = 3;
          say(G, 'rico', 'Fly her to the marina helipad. Do not land in the bay.');
          setMarker(G, 300, -40);
        }
        return { progress: 'Board the helicopter on the roof helipad' };
      }
      if (m.data.stage === 3) {
        if (G.player.vehicle && G.player.vehicle.kind === 'heli' && dist2(G.player.x, G.player.z, 300, -40) < 14 * 14) return 'done';
        return { progress: 'Fly to the marina helipad' };
      }
      return null;
    },
    done: (G) => { say(G, 'rico', 'The ledger is ours. Kane is finished in this bay. You are not a drifter anymore — you are the Bay King.'); },
  },
];
export function startMission(G, index) {
  const def = MISSIONS[index];
  const meta = MISSION_META[def.id];
  def.crew = meta.crew.map((k) => CREW[k]);
  def.next = meta.next;
  G.mission = { index, def, active: true, timer: 0, data: {} };
  G.hud.setMission(def.title, def.objective, '');
  def.intro(G);
}
const MISSION_META = {
  'first-gear': { crew: ['rico', 'dax'], next: 'SALTFLATS RUN' },
  'saltflats-run': { crew: ['lena'], next: 'NEON SPRINT' },
  'neon-sprint': { crew: ['mira'], next: 'HARBOR HEAT' },
  'harbor-heat': { crew: ['rico', 'tank'], next: 'HIGH ROLLER' },
  'high-roller': { crew: ['mira', 'tank'], next: 'THE KANE JOB' },
  'the-kane-job': { crew: ['rico', 'lena', 'tank', 'mira'], next: 'OWN THE BAY' },
};
export function completeMission(G) {
  const m = G.mission, def = m.def;
  clearMarker(G);
  G.player.cash += def.payout;
  G.player.respect += def.respect;
  G.player.stats.jobs++;
  G.audio.mission();
  G.hud.toast('JOB DONE · +' + fmtCash(def.payout) + ' · +' + def.respect + ' RESPECT');
  def.done(G);
  if (G.saveGame) G.saveGame();
  G.mission = { index: m.index + 1, def: null, active: false, timer: 0, data: {} };
  if (m.index + 1 < MISSIONS.length) {
    setTimeout(() => { if (G.state === 'play') startMission(G, m.index + 1); }, 4500);
  } else {
    G.hud.toast('ALL JOBS DONE — YOU OWN AZURA BAY');
  }
}
export function failMission(G) {
  clearMarker(G);
  G.audio.fail();
  G.hud.toast('JOB FAILED — try again');
  const idx = G.mission.index;
  G.mission = { index: idx, def: null, active: false, timer: 0, data: {} };
  setTimeout(() => { if (G.state === 'play') startMission(G, idx); }, 3000);
}
export function updateMissions(G, dt) {
  if (G.race.active) updateRace(G, dt);
  updateEnemies(G, dt);
  if (G.marker) {
    G.marker.dia.position.y = 6 + Math.sin(G.time * 3) * 0.8;
    G.marker.dia.rotation.y += dt * 2;
    G.marker.ring.scale.setScalar(1 + Math.sin(G.time * 3) * 0.12);
  }
  if (!G.mission.active || !G.mission.def) return;
  const res = G.mission.def.update(G, dt);
  if (res === 'done') completeMission(G);
  else if (res === 'fail') failMission(G);
  else if (res && res.progress) G.hud.setMission(G.mission.def.title, G.mission.def.objective, res.progress);
}
export function startRace(G, laps, context) {
  const rng = Math.random;
  const rivals = [];
  const keys = ['coupe', 'sedan', 'suv'];
  for (let i = 0; i < 3; i++) {
    const v = createVehicle(G, keys[i], RACE_START.x - (i + 1) * 8, RACE_START.z - 6, Math.PI / 2, { ai: 'race', name: ['Vex', 'Nova', 'Rook'][i] });
    rivals.push({ v, cp: 0, lap: 1, finished: false, time: 0 });
  }
  G.race = { active: true, laps, context, countdown: 3.2, cp: 0, lap: 1, rivals, startT: 0, playerTime: 0, positions: [] };
  setMarker(G, RACE_CPS[1][0], RACE_CPS[1][1]);
  G.hud.toast('RACE — 3 LAPS · 8 GATES');
  G.audio.horn();
}
function updateRace(G, dt) {
  const r = G.race;
  if (!r.active) return;
  if (r.countdown > 0) {
    r.countdown -= dt;
    const n = Math.ceil(r.countdown);
    G.hud.setMission('NEON SPRINT', 'Get ready…', n > 0 ? String(n) : 'GO!');
    if (r.countdown <= 0) { G.audio.horn(); G.hud.setMission('NEON SPRINT', 'Race!', 'Lap 1 / ' + r.laps); }
    return;
  }
  r.playerTime += dt;
  const p = G.player;
  const [cx, cz] = RACE_CPS[r.cp];
  if (dist2(p.x, p.z, cx, cz) < 14 * 14) {
    r.cp++;
    G.audio.pickup();
    if (r.cp >= RACE_CPS.length) {
      r.cp = 0; r.lap++;
      if (r.lap > r.laps) { finishRace(G, true); return; }
      G.hud.toast('LAP ' + r.lap + ' / ' + r.laps);
    }
    setMarker(G, RACE_CPS[r.cp][0], RACE_CPS[r.cp][1]);
  }
  for (const rv of r.rivals) {
    if (rv.finished) continue;
    rv.time += dt;
    const [tx, tz] = RACE_CPS[rv.cp];
    const dx = tx - rv.v.x, dz = tz - rv.v.z, d = Math.hypot(dx, dz);
    if (d < 14) {
      rv.cp++;
      if (rv.cp >= RACE_CPS.length) {
        rv.cp = 0; rv.lap++;
        if (rv.lap > r.laps) { rv.finished = true; }
      }
    }
    const want = Math.atan2(dx, dz);
    rv.v.heading = angLerp(rv.v.heading, want, clamp(dt * 2.5, 0, 1));
    const behind = (r.lap * 8 + r.cp) - (rv.lap * 8 + rv.cp);
    const target = clamp(30 + behind * 2.5, 24, 40);
    rv.v.speed = lerp(rv.v.speed, target, clamp(dt * 1.2, 0, 1));
    let nx = rv.v.x + Math.sin(rv.v.heading) * rv.v.speed * dt;
    let nz = rv.v.z + Math.cos(rv.v.heading) * rv.v.speed * dt;
    [nx, nz] = G.city.collide(nx, nz, 1.6);
    rv.v.x = nx; rv.v.z = nz;
    rv.v.mesh.position.set(nx, 0, nz);
    rv.v.mesh.rotation.y = rv.v.heading;
  }
  const prog = (lap, cp) => (lap - 1) * 8 + cp;
  const mine = prog(r.lap, r.cp);
  let pos = 1;
  for (const rv of r.rivals) if (prog(rv.lap, rv.cp) > mine) pos++;
  G.hud.setMission('NEON SPRINT', 'Race — ' + fmtTime(r.playerTime), 'Lap ' + r.lap + ' / ' + r.laps + ' · P' + pos + ' / 4');
}
function finishRace(G, playerWon) {
  const r = G.race;
  r.active = false;
  clearMarker(G);
  for (const rv of r.rivals) { G.scene.remove(rv.v.mesh); const i = G.vehicles.indexOf(rv.v); if (i >= 0) G.vehicles.splice(i, 1); }
  G.race = { active: false, laps: 0, context: '', countdown: 0, cp: 0, lap: 1, rivals: [], startT: 0, playerTime: 0, positions: [] };
  if (r.context === 'mission') {
    if (playerWon) {
      G.player.stats.raceWins++;
      if (!G.player.stats.bestLap || r.playerTime < G.player.stats.bestLap) G.player.stats.bestLap = r.playerTime;
      completeMission(G);
    } else {
      G.hud.toast('RACE LOST — back to the start line');
      setMarker(G, RACE_START.x, RACE_START.z);
    }
  } else {
    if (playerWon) {
      G.player.cash += 1000; G.player.stats.raceWins++;
      G.audio.cash(); G.hud.toast('RACE WON · +$1,000');
    } else G.hud.toast('RACE LOST — $0');
  }
}
