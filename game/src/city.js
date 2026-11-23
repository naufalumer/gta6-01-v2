import * as THREE from 'three';
import { mulberry32, clamp, lerp, TAU, glowTexture, signTexture, roadTexture } from './utils.js';

export const WORLD = 800; // city spans -400..400 on x and z
export const STREETS = [-320, -240, -160, -80, 0, 80, 160, 240, 320];
export const DISTRICTS = [
  { name: 'SEAGLASS BEACH', x0: -400, x1: 400, z0: 240, z1: 400, ground: 0xd9c28a, h: [8, 18] },
  { name: 'SALTFLATS PORT', x0: 240, x1: 400, z0: -400, z1: 240, ground: 0x8a8f98, h: [10, 26] },
  { name: 'PALM HEIGHTS', x0: -400, x1: 400, z0: -400, z1: -240, ground: 0x7fae6e, h: [8, 20] },
  { name: 'OLD CANNERY', x0: -400, x1: -240, z0: -240, z1: 240, ground: 0x9a8a76, h: [10, 24] },
  { name: 'SUNDIAL SQUARE', x0: -240, x1: 240, z0: -240, z1: 240, ground: 0xb8b0a4, h: [24, 88] },
];
export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  return DISTRICTS[4];
}
function facadeTexture(base, rng) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,.14)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 256, 6, 3);
  const cols = ['#ffd98a', '#9fd8ff', '#ffb36b', '#fff3c4', '#7fe3ff'];
  for (let y = 10; y < 246; y += 18) for (let x = 10; x < 118; x += 18) {
    if (rng() < 0.5) { g.fillStyle = cols[(rng() * cols.length) | 0]; g.globalAlpha = 0.5 + rng() * 0.5; g.fillRect(x, y, 11, 12); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const PALETTE = ['#ff8a7a', '#ffb35c', '#ffd23e', '#7fd8c9', '#5fb8e8', '#c98ad9', '#f2ead8', '#ff9ec4', '#8ae08a'];
export function buildCity(G) {
  const rng = mulberry32(20261124);
  const scene = G.scene;
  const city = { colliders: [], signs: [], windowMats: [], stacks: [], lights: [], helipads: [], water: null, pier: { x0: -8, x1: 40, z0: 300, z1: 372 } };
  G.city = city;
  const glowTex = glowTexture();
  for (const d of DISTRICTS) {
    const w = d.x1 - d.x0, h = d.z1 - d.z0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: d.ground, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2; m.position.set((d.x0 + d.x1) / 2, 0, (d.z0 + d.z1) / 2); m.receiveShadow = true;
    scene.add(m);
  }
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1e9dbb, roughness: 0.15, metalness: 0.55, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 160), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.4, 440); scene.add(water);
  city.water = waterMat;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(800, 84), new THREE.MeshStandardMaterial({ color: 0xe8d49a, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.05, 322); scene.add(sand);
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6b48, roughness: 0.9 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(48, 1.2, 76), pierMat);
  pier.position.set(16, 0.8, 336); scene.add(pier);
  city.colliders.push({ x0: -8, x1: 40, z0: 296, z1: 300 }); // pier gate posts
  const roadTex = roadTexture();
  roadTex.repeat.set(12, 1);
  const roadTexV = roadTex.clone();
  roadTexV.center.set(0.5, 0.5); roadTexV.rotation = Math.PI / 2; roadTexV.needsUpdate = true;
  const roadMatH = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 });
  const roadMatV = new THREE.MeshStandardMaterial({ map: roadTexV, roughness: 0.92 });
  for (const s of STREETS) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(800, 16), horizontal ? roadMatH : roadMatV);
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.position.set(0, 0.06, s); } else { road.rotation.z = Math.PI / 2; road.position.set(s, 0.06, 0); }
      road.receiveShadow = true; scene.add(road);
    }
  }
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b2, roughness: 1 });
  for (let bx = 0; bx < 8; bx++) for (let bz = 0; bz < 8; bz++) {
    const cx = -280 + bx * 80, cz = -280 + bz * 80;
    if (cz > 240) continue; // beach has no blocks
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(66, 66), walkMat);
    walk.rotation.x = -Math.PI / 2; walk.position.set(cx, 0.04, cz); walk.receiveShadow = true; scene.add(walk);
  }
  const facadeCache = {};
  const facade = (base) => {
    if (!facadeCache[base]) facadeCache[base] = facadeTexture(base, mulberry32(base.length * 7919 + 13));
    return facadeCache[base];
  };
  const winMats = [];
  function building(x, z, w, d, h, color) {
    const tex = facade(color);
    const side = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
    const top = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.95 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), side);
    mesh.position.set(x, h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); city.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    winMats.push(side);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, 2.4, d * 0.24), top);
    roof.position.set(x + w * 0.2, h + 1.2, z - d * 0.15); scene.add(roof);
    return mesh;
  }
  for (let bx = 0; bx < 8; bx++) for (let bz = 0; bz < 8; bz++) {
    const cx = -280 + bx * 80, cz = -280 + bz * 80;
    const d = districtAt(cx, cz);
    if (cz > 240) continue;
    if (bx === 4 && bz === 4) continue; // Sundial plaza
    const n = rng() < 0.55 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const w = 18 + rng() * 22, dep = 18 + rng() * 22;
      const h = d.h[0] + rng() * (d.h[1] - d.h[0]);
      const ox = n === 2 ? (i === 0 ? -15 : 15) : 0, oz = n === 2 ? (i === 0 ? 12 : -12) : 0;
      building(cx + ox, cz + oz, w, dep, h, PALETTE[(rng() * PALETTE.length) | 0]);
    }
  }
  city.windowMats = winMats;
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(10, 13, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0xd8d2c2 }));
  plaza.position.set(0, 0.6, 0); scene.add(plaza);
  const obelisk = new THREE.Mesh(new THREE.ConeGeometry(3.2, 26, 4), new THREE.MeshStandardMaterial({ color: 0xffd23e, roughness: 0.4, metalness: 0.4 }));
  obelisk.position.set(0, 14, 0); obelisk.rotation.y = Math.PI / 4; obelisk.castShadow = true; scene.add(obelisk);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6da85e, roughness: 1 });
  for (const [hx, hz, hr] of [[-260, -320, 90], [-80, -330, 70], [180, -320, 80], [300, -300, 60]]) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(hr, 20, 12), hillMat);
    hill.scale.y = 0.22; hill.position.set(hx, 0, hz); hill.receiveShadow = true; scene.add(hill);
  }
  const contCols = [0xd94f3d, 0x3d7dd9, 0x3da85e, 0xe8a13d, 0x8a5fd9];
  for (let i = 0; i < 26; i++) {
    const x = 258 + (i % 6) * 22, z = -220 + Math.floor(i / 6) * 30, h = 3 + (i % 3) * 3;
    const box = new THREE.Mesh(new THREE.BoxGeometry(18, h, 8), new THREE.MeshStandardMaterial({ color: contCols[i % 5], roughness: 0.8, metalness: 0.2 }));
    box.position.set(x, h / 2, z); box.castShadow = true; scene.add(box);
    city.colliders.push({ x0: x - 9, x1: x + 9, z0: z - 4, z1: z + 4 });
  }
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xe8d24a, roughness: 0.6, metalness: 0.4 });
  for (const cz of [-120, 40]) {
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(3, 42, 3), craneMat); leg1.position.set(330, 21, cz - 14); scene.add(leg1);
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(3, 42, 3), craneMat); leg2.position.set(330, 21, cz + 14); scene.add(leg2);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 46), craneMat); beam.position.set(330, 42, cz); scene.add(beam);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(46, 2, 2), craneMat); arm.position.set(308, 42, cz); scene.add(arm);
  }
  const wareMat = new THREE.MeshStandardMaterial({ color: 0xa89078, roughness: 0.9 });
  for (const [wx, wz] of [[-320, -80], [-300, 80], [-340, 180]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 30), wareMat);
    w.position.set(wx, 7, wz); w.castShadow = true; scene.add(w);
    city.colliders.push({ x0: wx - 22, x1: wx + 22, z0: wz - 15, z1: wz + 15 });
  }
  const stackMat = new THREE.MeshStandardMaterial({ color: 0x6e5a50, roughness: 0.9 });
  for (const [sx, sz] of [[-280, -140], [-260, 140]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 34, 12), stackMat);
    st.position.set(sx, 17, sz); st.castShadow = true; scene.add(st);
    city.colliders.push({ x0: sx - 4, x1: sx + 4, z0: sz - 4, z1: sz + 4 });
    city.stacks.push(new THREE.Vector3(sx, 35, sz));
  }
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3fae5e, roughness: 0.9, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.55 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s; trunk.rotation.z = 0.08; g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(4.4 * s, 1.1 * s), frondMat);
      f.position.y = 7 * s; f.rotation.y = (i / 4) * TAU; f.rotation.x = -0.9; f.translateZ(1.6 * s);
      g.add(f);
    }
    g.position.set(x, 0, z); scene.add(g);
  }
  for (let i = 0; i < 18; i++) palm(-380 + rng() * 760, 268 + rng() * 44, 0.9 + rng() * 0.5);
  for (let i = 0; i < 8; i++) palm(-300 + rng() * 600, -300 - rng() * 60, 0.9 + rng() * 0.4);
  for (let i = 0; i < 8; i++) palm((rng() < 0.5 ? -1 : 1) * (10 + rng() * 4), -200 + i * 50, 1);
  function neonSign(text, fg, x, y, z, ry, w = 14) {
    const tex = signTexture(text, fg);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(fg), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(w * 1.4, w * 0.5, 1); glow.position.copy(m.position); scene.add(glow);
    city.signs.push({ mesh: m, glow, phase: rng() * TAU, base: 1 });
    return m;
  }
  neonSign('NEON ROW', '#ff5fa2', 10, 16, -120, -Math.PI / 2);
  neonSign('TIDEWORKS', '#37e6ff', -10, 12, -40, Math.PI / 2);
  neonSign('CORAL CROWN', '#ffd23e', 10, 18, 40, -Math.PI / 2, 18);
  neonSign('PIER 9', '#7fe3ff', 44, 10, 300, -Math.PI / 2);
  neonSign('SEAGLASS', '#ff9ec4', -40, 9, 290, Math.PI / 2);
  neonSign('KANE ROW', '#ff3b4d', -10, 14, 120, Math.PI / 2);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.7, metalness: 0.5 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const s of [-240, -80, 80, 240]) for (let i = -320; i <= 320; i += 80) {
    for (const [px, pz] of [[s + 9, i], [i, s + 9]]) {
      if (pz > 250) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), poleMat);
      pole.position.set(px, 3.5, pz); scene.add(pole);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(9, 9, 1); glow.position.set(px, 7.1, pz); scene.add(glow);
      city.lights.push({ glow, x: px, z: pz });
    }
  }
  city.trafficLights = [];
  for (const [ix, iz] of [[-80, -80], [80, -80], [-80, 80], [80, 80]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 6.5, 6), poleMat);
    pole.position.y = 3.2; g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x181c22 }));
    box.position.set(0, 6.6, 0); g.add(box);
    const dots = [];
    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10), new THREE.MeshBasicMaterial({ color: [0xff3b4d, 0xffd23e, 0x2fbf71][i] }));
      dot.position.set(0, 7.5 - i * 0.85, 0.42); g.add(dot); dots.push(dot);
    }
    g.position.set(ix + 9, 0, iz + 9); scene.add(g);
    city.trafficLights.push({ x: ix, z: iz, dots, state: 2, timer: Math.random() * 6 });
  }
  for (const [hx, hz] of [[-160, 200], [300, -40]]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshStandardMaterial({ color: 0x2a2f3a }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(hx, 0.1, hz); scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(7.6, 8.6, 24), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.12, hz); scene.add(ring);
    city.helipads.push(new THREE.Vector3(hx, 0, hz));
  }
  city.collide = (x, z, r) => {
    let px = x, pz = z;
    for (const c of city.colliders) {
      const nx = clamp(px, c.x0, c.x1), nz = clamp(pz, c.z0, c.z1);
      const dx = px - nx, dz = pz - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2); px = nx + (dx / d) * r; pz = nz + (dz / d) * r;
      } else if (d2 <= 0.0001) {
        const pl = Math.min(px - c.x0, c.x1 - px, pz - c.z0, c.z1 - pz);
        if (pl === px - c.x0) px = c.x0 - r; else if (pl === c.x1 - px) px = c.x1 + r;
        else if (pl === pz - c.z0) pz = c.z0 - r; else pz = c.z1 + r;
      }
    }
    if (pz > 348 && !(px > city.pier.x0 && px < city.pier.x1 && pz < city.pier.z1)) pz = 348;
    px = clamp(px, -395, 395); pz = clamp(pz, -395, 395);
    return [px, pz];
  };
  city.onRoad = (x, z) => {
    for (const s of STREETS) if (Math.abs(x - s) < 9 || Math.abs(z - s) < 9) return true;
    return false;
  };
  return city;
}
