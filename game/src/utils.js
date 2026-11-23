import * as THREE from 'three';
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  return d;
}
export function angLerp(a, b, t) { return a + angDiff(a, b) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function fmtCash(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
export function fmtTime(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + String(s).padStart(2, '0'); }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
export function windowsTexture(rng) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#0e1420'; g.fillRect(0, 0, 128, 256);
  const cols = ['#ffd98a', '#9fd8ff', '#ffb36b', '#fff3c4', '#7fe3ff'];
  for (let y = 8; y < 248; y += 16) for (let x = 8; x < 120; x += 16) {
    if (rng() < 0.42) { g.fillStyle = cols[(rng() * cols.length) | 0]; g.globalAlpha = 0.55 + rng() * 0.45; g.fillRect(x, y, 10, 11); }
  }
  g.globalAlpha = 1;
  return tex(c);
}
export function roadTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#23262e'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 900; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  g.fillStyle = '#e8d24a'; g.fillRect(0, 124, 256, 4);
  g.fillStyle = 'rgba(255,255,255,.85)';
  for (let x = 0; x < 256; x += 64) { g.fillRect(x, 20, 34, 10); g.fillRect(x, 226, 34, 10); }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function signTexture(text, fg, bg) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg || '#0a0618'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.font = '900 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 26; g.fillStyle = fg;
  g.fillText(text, 256, 68); g.shadowBlur = 0; g.fillStyle = '#fff';
  g.font = '900 54px Arial'; g.globalAlpha = 0.85; g.fillText(text, 256, 68);
  return tex(c);
}
export function smokeTexture() {
  const [c, g] = canvas(128, 128);
  for (let i = 0; i < 26; i++) {
    const x = 34 + Math.random() * 60, y = 34 + Math.random() * 60, r = 12 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return tex(c);
}
