export class Input {
  constructor(G) {
    this.G = G;
    this.keys = {};
    this.mouseDX = 0; this.mouseDY = 0;
    this.fireHeld = false;
    this.touch = { active: false, mx: 0, mz: 0, fire: false, jump: false, enter: false, use: false };
    this.onKey = {}; // single-press actions, set by main.js
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      const fn = this.onKey[e.code];
      if (fn) fn();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    const canvas = document.getElementById('gl');
    canvas.addEventListener('click', () => {
      if (this.G.state === 'play' && !document.pointerLockElement) {
        try { canvas.requestPointerLock(); } catch { /* headless: no pointer lock */ }
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    document.addEventListener('mousedown', (e) => { if (e.button === 0) this.fireHeld = true; });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.fireHeld = false; });
    if ('ontouchstart' in window) {
      this.touch.active = true;
      document.getElementById('touch').style.display = 'block';
      this.bindTouch();
    }
  }
  bindTouch() {
    const stick = document.getElementById('stick'), knob = document.getElementById('stick-knob');
    let sid = null;
    const move = (e) => {
      const t = [...e.changedTouches].find((x) => x.identifier === sid);
      if (!t) return;
      const r = stick.getBoundingClientRect();
      let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.touch.mx = dx; this.touch.mz = -dy;
      knob.style.left = (38 + dx * 34) + 'px'; knob.style.top = (38 + dy * 34) + 'px';
    };
    stick.addEventListener('touchstart', (e) => { sid = e.changedTouches[0].identifier; move(e); e.preventDefault(); }, { passive: false });
    stick.addEventListener('touchmove', move, { passive: false });
    stick.addEventListener('touchend', () => { sid = null; this.touch.mx = 0; this.touch.mz = 0; knob.style.left = '38px'; knob.style.top = '38px'; });
    const btn = (id, key, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { this.touch[key] = true; if (down) down(); e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', () => { this.touch[key] = false; if (up) up(); });
    };
    btn('btn-fire', 'fire');
    btn('btn-jump', 'jump');
    btn('btn-enter', 'enter', () => this.onKey['KeyF'] && this.onKey['KeyF']());
    btn('btn-use', 'use', () => this.onKey['KeyE'] && this.onKey['KeyE']());
  }
  poll() {
    const k = this.keys, t = this.touch;
    const inp = {
      fwd: !!(k['KeyW'] || k['ArrowUp'] || t.mz > 0.25),
      back: !!(k['KeyS'] || k['ArrowDown'] || t.mz < -0.25),
      left: !!(k['KeyA'] || k['ArrowLeft'] || t.mx < -0.25),
      right: !!(k['KeyD'] || k['ArrowRight'] || t.mx > 0.25),
      jump: !!(k['Space'] || t.jump),
      sprint: !!(k['ShiftLeft'] || k['ShiftRight']),
      nitro: !!(k['ShiftLeft'] || k['ShiftRight']),
      fire: this.fireHeld || t.fire,
      hand: !!(k['Space']),
      mx: t.mx, mz: t.mz,
    };
    return inp;
  }
  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return [dx, dy];
  }
}
