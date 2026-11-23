import { fmtCash, fmtTime, clamp } from './utils.js';

const LEVELS = [[0, 'DRIFTER'], [100, 'WHEELMAN'], [300, 'FIXER'], [700, 'TIDE BOSS'], [1500, 'BAY KING']];
export function respectLevel(r) { let lv = 0; for (let i = 0; i < LEVELS.length; i++) if (r >= LEVELS[i][0]) lv = i; return lv; }
export function respectName(r) { return LEVELS[respectLevel(r)][1]; }

export class HUD {
  constructor(G) {
    this.G = G;
    const $ = (id) => document.getElementById(id);
    this.el = {};
    ['m-title', 'm-timer', 'm-progress', 'm-objective', 'm-next', 'm-crew', 'radio-name', 'radio-song', 'clock', 'cash', 'stars', 'sight', 'respect', 'patrol', 'district', 'weapon', 'veh-name', 'speed', 'condition', 'armor-bar', 'armor-num', 'health-bar', 'health-num', 'dialog', 'dlg-face', 'dlg-name', 'dlg-text', 'prompt', 'crosshair', 'toast', 'flash', 'minimap', 'map-canvas'].forEach((id) => { this.el[id.replace(/-/g, '_')] = $(id); });
    this.sayT = 0; this.toastT = 0; this.sayQueue = [];
    this._c = {}; this._mapT = 1;
  }
  say(name, role, text, color, initial) {
    this.sayQueue.push({ name, role, text, color, initial });
    if (this.sayT <= 0) this.nextSay();
  }
  nextSay() {
    const s = this.sayQueue.shift();
    if (!s) { this.el.dialog.style.display = 'none'; this.sayT = 0; return; }
    this.el.dlg_face.style.background = s.color;
    this.el.dlg_face.textContent = s.initial;
    this.el.dlg_name.innerHTML = s.name + ' <small>· ' + s.role + '</small>';
    this.el.dlg_text.textContent = s.text;
    this.el.dialog.style.display = 'block';
    this.sayT = 5.5;
  }
  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.style.display = 'block';
    this.toastT = 2.6;
  }
  setMission(title, objective, progress) {
    this.el.m_title.textContent = title;
    this.el.m_objective.textContent = objective;
    this.el.m_progress.textContent = progress || '';
  }
  setPrompt(text) {
    const el = this.el.prompt;
    if (!text) { el.style.display = 'none'; return; }
    el.innerHTML = text;
    el.style.display = 'block';
  }
  showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    if (id) document.getElementById(id).classList.add('on');
  }
  _set(key, el, value) {
    if (this._c[key] !== value) { this._c[key] = value; el.textContent = value; }
  }
  _html(key, el, value) {
    if (this._c[key] !== value) { this._c[key] = value; el.innerHTML = value; }
  }
  update(dt) {
    const G = this.G, p = G.player;
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.nextSay(); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.style.display = 'none'; }
    const h = Math.floor(G.dayTime / 60), m = Math.floor(G.dayTime % 60);
    this._set('clock', this.el.clock, String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    this._set('cash', this.el.cash, fmtCash(p.cash));
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < G.wanted.stars ? '★' : '<span class="off">★</span>';
    this._html('stars', this.el.stars, stars);
    const sight = this.el.sight;
    if (G.wanted.stars > 0) {
      sight.style.display = 'inline-block';
      this._set('sight', sight, G.wanted.seen ? 'IN SIGHT' : 'LOST THEM');
      sight.className = G.wanted.seen ? '' : 'lost';
    } else if (sight.style.display !== 'none') sight.style.display = 'none';
    this._set('respect', this.el.respect, 'RESPECT LV ' + (respectLevel(p.respect) + 1) + ' · ' + respectName(p.respect));
    const list = G.patrolList ? G.patrolList(G) : [];
    this._html('patrol', this.el.patrol, list.length
      ? '<div class="ph">AZURA PD — ON YOU</div>' + list.map((u) => '<div class="pu"><b>' + u.name + '</b><span>' + u.dist + 'M</span><em>' + u.tactic + '</em></div>').join('')
      : '');
    const crew = G.mission && G.mission.def ? G.mission.def.crew : null;
    this._html('crew', this.el.m_crew, crew ? crew.map((c) => '<span class="crew"><i style="background:' + c.color + '">' + c.initial + '</i><span>' + c.name + '<small>' + c.role + '</small></span></span>').join('') : '');
    const next = G.mission && G.mission.def ? G.mission.def.next : null;
    this._html('next', this.el.m_next, next ? 'NEXT: <b>' + next + '</b>' : '');
    this._set('timer', this.el.m_timer, G.mission && G.mission.timer > 0 ? fmtTime(G.mission.timer) : '');
    const st = G.audio.stations[G.audio.station];
    this._set('radio-name', this.el.radio_name, st.name);
    this._set('radio-song', this.el.radio_song, st.song);
    const ammo = p.ammo[p.weapon];
    this._html('weapon', this.el.weapon, p.weapon.toUpperCase() + ' <span>' + (ammo ? ammo[0] + ' / ' + ammo[1] : '—') + '</span>');
    const v = p.vehicle;
    this._set('veh', this.el.veh_name, v ? v.name.toUpperCase() : (p.jetpack && p.y > 0.5 ? 'JETPACK' : 'ON FOOT'));
    const spd = v ? Math.abs(v.speed) * 3.6 : Math.abs(p.speed) * 3.6;
    this._html('speed', this.el.speed, Math.round(spd) + '<small> KM/H</small>');
    this._set('cond', this.el.condition, v ? 'CONDITION ' + Math.round(v.condition) + '%' + (v.nitro < 100 ? ' · NITRO ' + Math.round(v.nitro) + '%' : '') : '');
    const armorW = clamp(p.armor, 0, 100) + '%', healthW = clamp(p.health, 0, 100) + '%';
    if (this._c.armorW !== armorW) { this._c.armorW = armorW; this.el.armor_bar.style.width = armorW; }
    if (this._c.healthW !== healthW) { this._c.healthW = healthW; this.el.health_bar.style.width = healthW; }
    this._set('armorN', this.el.armor_num, String(Math.round(p.armor)));
    this._set('healthN', this.el.health_num, String(Math.round(p.health)));
    const cross = v ? 'none' : (G.state === 'play' ? 'block' : 'none');
    if (this._c.cross !== cross) { this._c.cross = cross; this.el.crosshair.style.display = cross; }
    this._set('district', this.el.district, G.districtName ? G.districtName(p.x, p.z) : 'AZURA BAY');
    this._mapT += dt;
    if (this._mapT > 0.15) { this._mapT = 0; this.drawMinimap(); }
  }
  drawMinimap() {
    const G = this.G, cv = this.el.minimap, g = cv.getContext('2d');
    const S = 336, C = S / 2, scale = 1.5; // px per metre, local view
    const px = G.player.x, pz = G.player.z;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(C, C, C, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0d2b45'; g.fillRect(0, 0, S, S);
    const wy = (348 - pz) * scale + C;
    if (wy < S) { g.fillStyle = '#1e9dbb'; g.fillRect(0, wy, S, S - wy); }
    const by = (240 - pz) * scale + C;
    if (by < S) { g.fillStyle = '#d9c28a'; g.fillRect(0, by, S, Math.max(0, wy - by)); }
    g.strokeStyle = '#3a4152'; g.lineWidth = 9;
    const { STREETS } = G;
    for (const s of STREETS) {
      const rx = (s - px) * scale + C, rz = (s - pz) * scale + C;
      if (rx > -10 && rx < S + 10) { g.beginPath(); g.moveTo(rx, -10); g.lineTo(rx, S + 10); g.stroke(); }
      if (rz > -10 && rz < S + 10) { g.beginPath(); g.moveTo(-10, rz); g.lineTo(S + 10, rz); g.stroke(); }
    }
    g.fillStyle = '#ffd23e';
    for (const pk of G.packages || []) {
      if (pk.got) continue;
      const x = (pk.x - px) * scale + C, y = (pk.z - pz) * scale + C;
      if (x > 0 && x < S && y > 0 && y < S) { g.fillRect(x - 3, y - 3, 6, 6); }
    }
    if (G.marker) {
      const x = (G.marker.x - px) * scale + C, y = (G.marker.z - pz) * scale + C;
      const dx = x - C, dy = y - C, d = Math.hypot(dx, dy);
      let mx = x, my = y;
      if (d > C - 14) { mx = C + (dx / d) * (C - 14); my = C + (dy / d) * (C - 14); }
      g.fillStyle = '#ffd23e';
      g.save(); g.translate(mx, my); g.rotate(Math.PI / 4); g.fillRect(-7, -7, 14, 14); g.restore();
    }
    g.fillStyle = '#ff3b4d';
    const dots = [];
    for (const c of (G.police ? G.police.foot : [])) dots.push([c.x, c.z]);
    for (const u of (G.police ? G.police.cars : [])) dots.push([u.v.x, u.v.z]);
    for (const [x, z] of dots) {
      const mx = (x - px) * scale + C, my = (z - pz) * scale + C;
      if (mx > 0 && mx < S && my > 0 && my < S) { g.beginPath(); g.arc(mx, my, 5, 0, Math.PI * 2); g.fill(); }
    }
    g.save();
    g.translate(C, C); g.rotate(G.player.heading);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill();
    g.strokeStyle = '#ffd23e'; g.lineWidth = 2; g.stroke();
    g.restore();
    g.restore();
  }
  drawMap() {
    const G = this.G, cv = this.el.map_canvas, g = cv.getContext('2d');
    const S = 1120, scale = S / 800, ox = S / 2, oy = S / 2;
    const X = (x) => x * scale + ox, Y = (z) => z * scale + oy;
    g.fillStyle = '#0d2b45'; g.fillRect(0, 0, S, S);
    const cols = { 'SEAGLASS BEACH': '#d9c28a', 'SALTFLATS PORT': '#8a8f98', 'PALM HEIGHTS': '#7fae6e', 'OLD CANNERY': '#9a8a76', 'SUNDIAL SQUARE': '#b8b0a4' };
    for (const d of G.districts) {
      g.fillStyle = cols[d.name] || '#888';
      g.fillRect(X(d.x0), Y(d.z0), (d.x1 - d.x0) * scale, (d.z1 - d.z0) * scale);
    }
    g.fillStyle = '#1e9dbb'; g.fillRect(0, Y(348), S, S - Y(348));
    g.strokeStyle = '#23262e'; g.lineWidth = 20;
    for (const s of G.STREETS) {
      g.beginPath(); g.moveTo(X(-400), Y(s)); g.lineTo(X(400), Y(s)); g.stroke();
      g.beginPath(); g.moveTo(X(s), Y(-400)); g.lineTo(X(s), Y(400)); g.stroke();
    }
    const marks = [
      ['🏠', -160, 200, 'Safehouse'], ['🔧', -8, -40, 'Tideworks Customs'], ['🏁', -160, -160, 'Street race'],
      ['💼', 300, -160, 'Port'], ['✚', 120, 120, 'Clinic'], ['🎣', 16, 336, 'Pier 9'], ['🏀', -40, 280, 'Court'],
      ['👮', 80, 80, 'Precinct'], ['🎰', 10, 40, 'Coral Crown'],
    ];
    g.font = '28px Arial'; g.textAlign = 'center';
    for (const [icon, x, z, label] of marks) {
      g.fillText(icon, X(x), Y(z) + 10);
      g.font = '16px Arial'; g.fillStyle = '#fff';
      g.fillText(label, X(x), Y(z) + 32);
      g.font = '28px Arial';
    }
    g.fillStyle = '#ffd23e';
    for (const pk of G.packages || []) if (!pk.got) { g.beginPath(); g.arc(X(pk.x), Y(pk.z), 7, 0, Math.PI * 2); g.fill(); }
    if (G.marker) {
      g.fillStyle = '#ff3b4d';
      g.beginPath(); g.arc(X(G.marker.x), Y(G.marker.z), 12, 0, Math.PI * 2); g.fill();
    }
    g.save();
    g.translate(X(G.player.x), Y(G.player.z)); g.rotate(G.player.heading);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -16); g.lineTo(12, 13); g.lineTo(0, 6); g.lineTo(-12, 13); g.closePath(); g.fill();
    g.restore();
    const p = G.player;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('map-respect', 'LV ' + (respectLevel(p.respect) + 1) + ' · ' + respectName(p.respect));
    set('map-cash', fmtCash(p.cash));
    set('map-jobs', p.stats.jobs + ' / 6');
    set('map-complete', Math.round((p.stats.jobs / 6) * 50 + (p.stats.packages / 12) * 20 + (p.stats.raceWins > 0 ? 10 : 0) + (p.respect >= 1500 ? 20 : 0)) + '%');
    const crewHtml = [['RICO', 'fixer'], ['LENA', 'planner'], ['TANK', 'muscle'], ['MIRA', 'driver']].map(([n, r]) => '<div class="stat"><span>' + n + '</span><b>' + r + '</b></div>').join('');
    set('map-crew', crewHtml);
    const s = p.stats;
    set('map-stats', 'cars stolen ' + s.carsStolen + '<br>stars lost ' + s.starsLost + '<br>knockouts ' + s.knockouts + '<br>race wins ' + s.raceWins + '<br>best lap ' + (s.bestLap ? fmtTime(s.bestLap) : '—') + '<br>km driven ' + s.kmDriven.toFixed(1) + '<br>fish caught ' + s.fish + '<br>packages ' + s.packages + ' / 12');
  }
}
