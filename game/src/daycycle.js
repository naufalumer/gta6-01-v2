import * as THREE from 'three';
import { clamp, lerp } from './utils.js';

const PHASES = {
  morning: { sky: 0x8fd0f2, fog: 0xa8d4e8, sun: 0xffe9b0, sunI: 2.4, hemiI: 1.0, exp: 1.12, win: 0.1, lamp: 0.0, neon: 0.55 },
  noon: { sky: 0x6fc4f0, fog: 0x9fd0e8, sun: 0xfff6d8, sunI: 2.8, hemiI: 1.1, exp: 1.12, win: 0.0, lamp: 0.0, neon: 0.4 },
  dusk: { sky: 0xff9e7a, fog: 0xf2a58e, sun: 0xff8a4d, sunI: 2.0, hemiI: 0.85, exp: 1.18, win: 0.55, lamp: 0.5, neon: 0.95 },
  night: { sky: 0x1a2a55, fog: 0x22345e, sun: 0x9db8ff, sunI: 0.85, hemiI: 0.62, exp: 1.28, win: 1.0, lamp: 1.0, neon: 1.0 },
};
function phaseAt(minutes) {
  const h = minutes / 60;
  if (h >= 6 && h < 11) return ['morning', 0];
  if (h >= 11 && h < 16) return ['noon', 0];
  if (h >= 16 && h < 20) return ['dusk', (h - 16) / 4];
  return ['night', 0];
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
export function updateDayCycle(G, dt) {
  G.dayTime += dt * 3; // 3 game-minutes per real second: full day in 8 minutes
  if (G.dayTime >= 1440) G.dayTime -= 1440;
  const [name, blend] = phaseAt(G.dayTime);
  const P = PHASES[name];
  const N = PHASES.night;
  const k = name === 'dusk' ? blend : 0;
  const sky = _c1.setHex(P.sky).lerp(_c2.setHex(N.sky), k);
  const fog = new THREE.Color(P.fog).lerp(new THREE.Color(N.fog), k);
  G.scene.background = sky;
  G.scene.fog.color.copy(fog);
  G.scene.fog.near = 120; G.scene.fog.far = 620;
  const sunI = lerp(P.sunI, N.sunI, k), hemiI = lerp(P.hemiI, N.hemiI, k);
  G.sun.intensity = sunI;
  G.sun.color.setHex(P.sun);
  G.hemi.intensity = hemiI;
  G.renderer.toneMappingExposure = lerp(P.exp, N.exp, k);
  const dayFrac = ((G.dayTime - 360) / 1440) * Math.PI * 2; // 06:00 = sunrise
  const el = Math.sin(dayFrac) * 0.9 + 0.25;
  G.sun.position.set(Math.cos(dayFrac) * 300, Math.max(40, el * 320), 180);
  const win = lerp(P.win, N.win, k), lamp = lerp(P.lamp, N.lamp, k);
  for (const m of G.city.windowMats) m.emissiveIntensity = win * 0.9;
  for (const l of G.city.lights) l.glow.material.opacity = lamp * 0.85;
  const neon = lerp(P.neon, N.neon, k);
  for (const s of G.city.signs) {
    const flick = 0.82 + 0.18 * Math.sin(G.time * 7 + s.phase) * Math.sin(G.time * 3.3 + s.phase * 2);
    s.mesh.material.opacity = neon * flick;
    s.glow.material.opacity = neon * 0.5 * flick;
  }
  G.city.water.color.setHex(name === 'night' ? 0x1a4a8a : name === 'dusk' ? 0x2a7a9e : 0x1e9dbb);
  G.city.water.opacity = 0.92;
  for (const tl of G.city.trafficLights) {
    tl.timer -= dt;
    if (tl.timer <= 0) { tl.state = (tl.state + 1) % 3; tl.timer = tl.state === 1 ? 1.5 : 6; }
    tl.dots.forEach((dot, i) => {
      const active = (tl.state === 2 && i === 2) || (tl.state === 1 && i === 1) || (tl.state === 0 && i === 0);
      dot.material.color.setHex(active ? [0xff3b4d, 0xffd23e, 0x2fbf71][i] : 0x222222);
    });
  }
  G.phaseName = name;
  G.nightF = name === 'night' ? 1 : name === 'dusk' ? 0.6 : 0;
}
