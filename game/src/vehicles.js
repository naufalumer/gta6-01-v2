import * as THREE from 'three';
import { mulberry32, clamp, lerp, angLerp, angDiff, TAU } from './utils.js';

const PROFILES = {
  sedan: [[2.3, 0.28], [2.3, 0.72], [1.55, 0.95], [0.75, 1.36], [-0.75, 1.36], [-1.55, 0.95], [-2.3, 0.78], [-2.3, 0.28]],
  coupe: [[2.35, 0.26], [2.35, 0.68], [1.5, 0.9], [0.6, 1.22], [-0.7, 1.22], [-1.5, 0.9], [-2.3, 0.74], [-2.3, 0.26]],
  suv: [[2.3, 0.3], [2.3, 0.95], [1.6, 1.15], [0.9, 1.68], [-1.1, 1.68], [-1.8, 1.2], [-2.3, 1.0], [-2.3, 0.3]],
  truck: [[2.4, 0.3], [2.4, 0.9], [1.7, 1.05], [1.15, 1.62], [-0.15, 1.62], [-0.6, 1.05], [-0.75, 0.95], [-2.4, 0.95], [-2.4, 0.3]],
  taxi: [[2.3, 0.28], [2.3, 0.72], [1.55, 0.95], [0.75, 1.36], [-0.75, 1.36], [-1.55, 0.95], [-2.3, 0.78], [-2.3, 0.28]],
  van: [[2.4, 0.3], [2.4, 1.15], [1.7, 1.45], [0.9, 1.95], [-1.6, 1.95], [-2.2, 1.5], [-2.4, 1.0], [-2.4, 0.3]],
  police: [[2.3, 0.28], [2.3, 0.72], [1.55, 0.95], [0.75, 1.36], [-0.75, 1.36], [-1.55, 0.95], [-2.3, 0.78], [-2.3, 0.28]],
};
const GLASS = {
  sedan: [[1.5, 0.96], [0.72, 1.34], [-0.72, 1.34], [-1.5, 0.96]],
  coupe: [[1.45, 0.92], [0.58, 1.2], [-0.68, 1.2], [-1.45, 0.92]],
  suv: [[1.55, 1.16], [0.88, 1.66], [-1.08, 1.66], [-1.75, 1.2]],
  truck: [[1.65, 1.06], [1.12, 1.6], [-0.12, 1.6], [-0.58, 1.06]],
  taxi: [[1.5, 0.96], [0.72, 1.34], [-0.72, 1.34], [-1.5, 0.96]],
  van: [[1.65, 1.46], [0.88, 1.93], [-1.58, 1.93], [-2.15, 1.5]],
  police: [[1.5, 0.96], [0.72, 1.34], [-0.72, 1.34], [-1.5, 0.96]],
};
export const CAR_MODELS = {
  sedan: { name: 'Vireo GT', top: 46, accel: 17, len: 4.6, width: 1.9 },
  coupe: { name: 'Comet S', top: 52, accel: 20, len: 4.6, width: 1.85 },
  suv: { name: 'Terrano X', top: 42, accel: 15, len: 4.7, width: 2.0 },
  truck: { name: 'Hauler 9', top: 38, accel: 13, len: 5.0, width: 2.0 },
  taxi: { name: 'Sunline Cab', top: 44, accel: 16, len: 4.6, width: 1.9 },
  van: { name: 'Courier Van', top: 40, accel: 14, len: 4.8, width: 2.0 },
  police: { name: 'Bay Patrol', top: 50, accel: 19, len: 4.6, width: 1.9 },
};
const PAINT = [0xd94f3d, 0x2f6fd9, 0xe8a13d, 0x3da85e, 0xd9d9d9, 0x22242c, 0xff5fa2, 0x37e6ff, 0x7a4fd9];
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1c26, metalness: 0.9, roughness: 0.12 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.95 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.85, roughness: 0.3 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.2 });
function extrude(profile, width, mat, bevel = 0.05) {
  const s = new THREE.Shape();
  s.moveTo(profile[0][0], profile[0][1]);
  for (let i = 1; i < profile.length; i++) s.lineTo(profile[i][0], profile[i][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  geo.rotateY(-Math.PI / 2); // shape +x (front) -> +z; extrude depth -> width on x
  geo.translate(width / 2 + bevel, 0, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
function wheel(r = 0.37) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 14), tireMat);
  tire.rotation.z = Math.PI / 2; tire.castShadow = true; g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.32, 10), hubMat);
  hub.rotation.z = Math.PI / 2; g.add(hub);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.1, 12), new THREE.MeshBasicMaterial({ color: 0x0a0a0e }));
  arch.rotation.z = Math.PI / 2; g.add(arch);
  return g;
}
export function makeCarMesh(modelKey, colorHex, isPolice = false) {
  const model = CAR_MODELS[modelKey];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: isPolice ? 0xf2f4f6 : colorHex, metalness: 0.65, roughness: 0.32 });
  const body = extrude(PROFILES[modelKey], model.width - 0.1, paint);
  g.add(body);
  const glass = extrude(GLASS[modelKey], model.width - 0.34, glassMat, 0.03);
  glass.position.y = 0.02; g.add(glass);
  const ax = model.len / 2 - 0.85;
  for (const [wx, wz] of [[-ax, 0], [ax, 0]]) for (const side of [-1, 1]) {
    const w = wheel(modelKey === 'truck' || modelKey === 'suv' ? 0.42 : 0.37);
    w.position.set(side * (model.width / 2 - 0.05), 0.37, wz); g.add(w);
  }
  const bump = new THREE.Mesh(new THREE.BoxGeometry(model.width - 0.06, 0.22, 0.3), chromeMat);
  bump.position.set(0, 0.32, model.len / 2 - 0.05); g.add(bump);
  const bump2 = bump.clone(); bump2.position.z = -model.len / 2 + 0.05; g.add(bump2);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(model.width * 0.5, 0.16, 0.08), tireMat);
  grille.position.set(0, 0.62, model.len / 2 + 0.02); g.add(grille);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xfff2a8, emissiveIntensity: 0.7 });
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.08), headMat);
    hl.position.set(side * (model.width / 2 - 0.35), 0.68, model.len / 2 + 0.02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a0f16, emissive: 0xff2030, emissiveIntensity: 0.9 }));
    tl.position.set(side * (model.width / 2 - 0.35), 0.68, -model.len / 2 - 0.02); g.add(tl);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.22), paint);
    mir.position.set(side * (model.width / 2 + 0.06), 1.05, 0.75); g.add(mir);
  }
  if (modelKey === 'taxi') {
    const band = new THREE.Mesh(new THREE.BoxGeometry(model.width + 0.02, 0.2, 3.2), new THREE.MeshStandardMaterial({ color: 0x11131a }));
    band.position.set(0, 0.85, 0); g.add(band);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xffd23e, emissiveIntensity: 0.6 }));
    sign.position.set(0, 1.48, 0); g.add(sign);
  }
  if (modelKey === 'coupe') {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(model.width - 0.3, 0.06, 0.5), tireMat);
    sp.position.set(0, 1.02, -model.len / 2 + 0.35); sp.rotation.x = -0.18; g.add(sp);
  }
  if (isPolice) {
    const black = new THREE.MeshStandardMaterial({ color: 0x14161c, metalness: 0.5, roughness: 0.4 });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(model.width - 0.14, 0.06, 1.5), black);
    hood.position.set(0, 0.99, 1.55); hood.rotation.x = 0.12; g.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(model.width - 0.14, 0.06, 1.1), black);
    trunk.position.set(0, 0.99, -1.85); trunk.rotation.x = -0.1; g.add(trunk);
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.62, 1.7), black);
      door.position.set(side * (model.width / 2 + 0.01), 0.72, 0); g.add(door);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), black);
    bar.position.set(0, 1.44, 0.1); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: 0x7a0d12, emissive: 0xff2030, emissiveIntensity: 2 }));
    red.position.set(-0.28, 1.52, 0.1); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.26), new THREE.MeshStandardMaterial({ color: 0x0d2a7a, emissive: 0x2a6bff, emissiveIntensity: 2 }));
    blue.position.set(0.28, 1.52, 0.1); g.add(blue);
    g.userData.lightBar = { red, blue };
  }
  return g;
}
export function makeBikeMesh(colorHex) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.7, roughness: 0.3 });
  for (const z of [0.75, -0.75]) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.11, 8, 18), tireMat);
    tire.position.set(0, 0.36, z); tire.castShadow = true; g.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), hubMat);
    hub.rotation.z = Math.PI / 2; hub.position.set(0, 0.36, z); g.add(hub);
  }
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.85), paint);
  tank.position.set(0, 0.78, 0.18); tank.rotation.x = -0.28; g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.7), tireMat);
  seat.position.set(0, 0.82, -0.5); g.add(seat);
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), chromeMat);
  fork.position.set(0, 0.75, 0.72); fork.rotation.x = 0.5; g.add(fork);
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), chromeMat);
  bars.rotation.z = Math.PI / 2; bars.position.set(0, 1.08, 0.42); g.add(bars);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xfff2a8, emissiveIntensity: 1 }));
  head.position.set(0, 0.92, 0.85); g.add(head);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 8), chromeMat);
  pipe.rotation.x = Math.PI / 2; pipe.position.set(0.2, 0.42, -0.55); g.add(pipe);
  return g;
}
export function makeHeliMesh(isPolice = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: isPolice ? 0xf2f4f6 : 0xd94f3d, metalness: 0.6, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), paint);
  body.scale.set(1.05, 0.95, 1.7); body.position.y = 1.6; body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8, 0, TAU, 0, 1.1), glassMat);
  glass.scale.set(1.0, 0.85, 1.0); glass.position.set(0, 1.75, 1.05); glass.rotation.x = -0.5; g.add(glass);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 3.6, 8), paint);
  boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.8, -3.4); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.9), paint);
  fin.position.set(0, 2.4, -5.0); g.add(fin);
  const tail = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.16), tireMat);
    b.position.y = i === 0 ? 0.65 : -0.65; tail.add(b);
  }
  tail.position.set(0.4, 2.2, -4.9); tail.rotation.x = Math.PI / 2; g.add(tail);
  g.userData.tailRotor = tail;
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 5.6), tireMat);
    blade.position.z = i === 0 ? 2.8 : -2.8; rotor.add(blade);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8), chromeMat);
  rotor.add(hub); rotor.position.y = 3.15; g.add(rotor);
  g.userData.rotor = rotor;
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), chromeMat);
    skid.rotation.x = Math.PI / 2; skid.position.set(side * 0.95, 0.25, 0.4); g.add(skid);
    for (const z of [1.2, -0.6]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), chromeMat);
      strut.position.set(side * 0.95, 0.7, z); g.add(strut);
    }
  }
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 3.2), new THREE.MeshStandardMaterial({ color: 0x14161c }));
    stripe.position.set(0, 1.35, 0.6); g.add(stripe);
  }
  return g;
}
export function makeJetpackMesh() {
  const g = new THREE.Group();
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.85, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.55, 10), tankMat);
    tank.position.set(side * 0.2, 0, 0); g.add(tank);
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x333a44, emissive: 0xff7a1a, emissiveIntensity: 0.8 }));
    nozzle.rotation.x = Math.PI; nozzle.position.set(side * 0.2, -0.4, 0); g.add(nozzle);
  }
  return g;
}
export function makePersonMesh(shirt, pants, skin, hair) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skinMat);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, TAU, 0, 1.4), new THREE.MeshStandardMaterial({ color: hair, roughness: 1 }));
  hairM.position.y = 1.66; g.add(hairM);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
  torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
  const limbs = {};
  for (const [key, x, y, w, h, mat] of [['armL', -0.32, 1.28, 0.14, 0.55, skinMat], ['armR', 0.32, 1.28, 0.14, 0.55, skinMat], ['legL', -0.14, 0.68, 0.17, 0.66, pantsMat], ['legR', 0.14, 0.68, 0.17, 0.66, pantsMat]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, y + h / 2, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = -h / 2; m.castShadow = true; pivot.add(m); g.add(pivot); limbs[key] = pivot;
  }
  g.userData.limbs = limbs;
  return g;
}
export function createVehicle(G, modelKey, x, z, heading, opts = {}) {
  const model = CAR_MODELS[modelKey];
  const color = opts.color ?? PAINT[(Math.random() * PAINT.length) | 0];
  const mesh = makeCarMesh(modelKey, color, opts.police === true);
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  G.scene.add(mesh);
  const v = {
    kind: 'car', modelKey, name: opts.name || model.name, mesh, color,
    x, z, heading, speed: 0, steer: 0, health: 100, condition: 100,
    top: model.top, accel: model.accel, police: opts.police === true,
    parked: opts.parked === true, upgrades: { engine: 0, armor: 0, nitro: 0 },
    nitro: 100, drift: 0, smokeT: 0, dead: false, ai: opts.ai || null, route: opts.route || null, routeI: 0,
  };
  G.vehicles.push(v);
  return v;
}
export function createBike(G, x, z, heading, color = 0xd94f3d) {
  const mesh = makeBikeMesh(color);
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  G.scene.add(mesh);
  const v = { kind: 'bike', modelKey: 'bike', name: 'Street Hawk', mesh, color, x, z, heading, speed: 0, steer: 0, health: 100, condition: 100, top: 48, accel: 22, police: false, parked: false, upgrades: { engine: 0, armor: 0, nitro: 0 }, nitro: 100, drift: 0, smokeT: 0, dead: false, ai: null, route: null };
  G.vehicles.push(v);
  return v;
}
export function createHeli(G, x, z, y, isPolice = false) {
  const mesh = makeHeliMesh(isPolice);
  mesh.position.set(x, y, z);
  G.scene.add(mesh);
  const v = { kind: 'heli', modelKey: 'heli', name: isPolice ? 'Air One' : 'Skyhawk', mesh, color: isPolice ? 0xf2f4f6 : 0xd94f3d, x, z, y, heading: 0, speed: 0, health: 100, condition: 100, top: 34, police: isPolice, parked: false, upgrades: { engine: 0, armor: 0, nitro: 0 }, nitro: 100, drift: 0, smokeT: 0, dead: false, ai: null, route: null, rotor: mesh.userData.rotor, tailRotor: mesh.userData.tailRotor };
  G.vehicles.push(v);
  return v;
}
export function driveVehicle(G, v, inp, dt) {
  const up = v.upgrades.engine * 0.07, top = v.top * (1 + up) * (inp.nitro && v.nitro > 0 ? 1.35 : 1);
  if (inp.nitro && v.speed > 4 && v.nitro > 0) v.nitro = Math.max(0, v.nitro - 22 * dt);
  else v.nitro = Math.min(100, v.nitro + 6 * dt);
  if (inp.fwd) v.speed += v.accel * dt * (v.speed < 0 ? 2.4 : 1);
  if (inp.back) v.speed -= v.accel * 0.9 * dt;
  v.speed -= v.speed * (inp.hand ? 1.4 : 0.55) * dt;
  v.speed = clamp(v.speed, -12, top);
  const steerTarget = (inp.left ? 1 : 0) - (inp.right ? 1 : 0);
  const grip = inp.hand ? 0.35 : 1;
  v.steer = lerp(v.steer, steerTarget * (v.kind === 'bike' ? 0.85 : 0.62), clamp(dt * 7, 0, 1));
  const turn = v.steer * (v.speed / top) * 2.1 * grip * (v.speed < 0 ? -1 : 1);
  v.heading += turn * dt;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let nx = v.x + fx * v.speed * dt, nz = v.z + fz * v.speed * dt;
  if (inp.hand && Math.abs(v.speed) > 12) {
    nx += Math.cos(v.heading) * v.steer * v.speed * 0.28 * dt;
    nz -= Math.sin(v.heading) * v.steer * v.speed * 0.28 * dt;
    v.drift += dt;
    if (v.drift > 0.4 && Math.random() < 0.7) G.spawnSmoke(v.x - fx * 1.6, 0.35, v.z - fz * 1.6, 1.6, 0.55, 0xcfd4da);
    if (v.drift > 1 && Math.random() < 0.3) G.addSkid(v.x, v.z, v.heading);
    if (v.drift > 1.2) { G.player.cash += 2; v.drift = 0; G.hud.toast('+ $2 DRIFT'); }
  } else v.drift = 0;
  v.smokeT -= dt;
  if (Math.abs(v.speed) > 6 && v.smokeT <= 0) {
    v.smokeT = 0.16 - Math.min(0.1, Math.abs(v.speed) * 0.001);
    G.spawnSmoke(v.x - fx * (v.kind === 'bike' ? 0.9 : 2.2), 0.4, v.z - fz * (v.kind === 'bike' ? 0.9 : 2.2), 0.7 + Math.abs(v.speed) * 0.012, 0.35, 0x9aa0aa);
  }
  [nx, nz] = G.city.collide(nx, nz, 1.6);
  const moved = Math.hypot(nx - v.x, nz - v.z);
  v.x = nx; v.z = nz;
  v.mesh.position.set(v.x, 0, v.z);
  v.mesh.rotation.y = v.heading;
  v.mesh.rotation.z = -v.steer * clamp(Math.abs(v.speed) / 20, 0, 1) * 0.09;
  v.mesh.rotation.x = clamp(-(inp.fwd ? 1 : 0) * 0.02 + (inp.back ? 1 : 0) * 0.03, -0.04, 0.04);
  return moved;
}
export function damageVehicle(G, v, dmg) {
  const armor = v.upgrades.armor > 0 ? 0.5 : 1;
  v.health -= dmg * armor;
  v.condition = Math.max(0, v.health);
  if (v.health <= 0 && !v.dead) {
    v.dead = true;
    G.explode(v.x, 1.2, v.z, 2.2);
    if (G.player.vehicle === v) { G.player.vehicle = null; G.player.onFoot = true; }
  }
}
import { STREETS } from './city.js';
export function spawnParkedCars(G) {
  const rng = mulberry32(777);
  const keys = ['sedan', 'coupe', 'suv', 'taxi', 'van', 'truck'];
  const made = [];
  for (let i = 0; i < 18; i++) {
    const horizontal = rng() < 0.5;
    const s = STREETS[(rng() * STREETS.length) | 0];
    const along = -320 + rng() * 640;
    const side = (rng() < 0.5 ? -1 : 1) * 6.2;
    const x = horizontal ? along : s + side;
    const z = horizontal ? s + side : along;
    const heading = horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const v = createVehicle(G, keys[(rng() * keys.length) | 0], x, z, heading, { parked: true });
    made.push(v);
  }
  return made;
}
export function spawnTraffic(G) {
  const rng = mulberry32(4242);
  const keys = ['sedan', 'coupe', 'suv', 'taxi', 'van'];
  const made = [];
  for (let i = 0; i < 26; i++) {
    const s1 = STREETS[(rng() * STREETS.length) | 0], s2 = STREETS[(rng() * STREETS.length) | 0];
    const v = createVehicle(G, keys[(rng() * keys.length) | 0], s1, s2, rng() * TAU, { ai: 'traffic' });
    v.route = [];
    for (let j = 0; j < 6; j++) v.route.push([STREETS[(rng() * STREETS.length) | 0], STREETS[(rng() * STREETS.length) | 0]]);
    v.routeI = 0;
    v.cruise = 9 + rng() * 4;
    made.push(v);
  }
  return made;
}
export function updateTraffic(G, dt) {
  for (const v of G.vehicles) {
    if (v.ai !== 'traffic' || v.dead) continue;
    const [tx, tz] = v.route[v.routeI];
    const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
    if (d < 6) { v.routeI = (v.routeI + 1) % v.route.length; continue; }
    const want = Math.atan2(dx, dz);
    const turn = clamp(angDiff(v.heading, want), -1, 1);
    v.heading += turn * clamp(dt * 2.2, 0, 1);
    let target = v.cruise;
    for (const tl of G.city.trafficLights) {
      const tdx = tl.x - v.x, tdz = tl.z - v.z, td = Math.hypot(tdx, tdz);
      if (td < 14 && td > 2) {
        const ahead = Math.cos(angDiff(v.heading, Math.atan2(tdx, tdz)));
        if (ahead > 0.7 && tl.state === 0) target = 0;
      }
    }
    for (const o of G.vehicles) {
      if (o === v || o.dead) continue;
      const ox = o.x - v.x, oz = o.z - v.z, od = Math.hypot(ox, oz);
      if (od < 10 && Math.cos(angDiff(v.heading, Math.atan2(ox, oz))) > 0.85) { target = 0; break; }
    }
    v.speed = lerp(v.speed, target, clamp(dt * 1.6, 0, 1));
    let nx = v.x + Math.sin(v.heading) * v.speed * dt;
    let nz = v.z + Math.cos(v.heading) * v.speed * dt;
    [nx, nz] = G.city.collide(nx, nz, 1.6);
    v.x = nx; v.z = nz;
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;
    v.smokeT -= dt;
    if (Math.abs(v.speed) > 6 && v.smokeT <= 0) {
      v.smokeT = 0.3;
      G.spawnSmoke(v.x - Math.sin(v.heading) * 2.2, 0.4, v.z - Math.cos(v.heading) * 2.2, 0.6, 0.3, 0x9aa0aa);
    }
  }
}
export function updateLightBars(G, t) {
  const on = Math.floor(t * 4) % 2 === 0;
  for (const v of G.vehicles) {
    if (!v.police || v.kind !== 'car') continue;
    const bar = v.mesh.userData.lightBar;
    if (!bar) continue;
    bar.red.material.emissiveIntensity = on ? 3 : 0.15;
    bar.blue.material.emissiveIntensity = on ? 0.15 : 3;
  }
}
