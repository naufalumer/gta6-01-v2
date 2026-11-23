import { createVehicle, createHeli } from './vehicles.js';
import { addWanted, updatePolice } from './police.js';
import { startRace } from './missions.js';

export function applyShot(G, name) {
  const p = G.player;
  if (name === 'chase') {
    G.dayTime = 18 * 60 + 45;
    const car = createVehicle(G, 'coupe', 0, 60, 0, { color: 0xd94f3d });
    G.enterVehicle(car, true);
    car.speed = 34;
    addWanted(G, 4, 'shot');
    for (let i = 0; i < 6; i++) updatePolice(G, 0.5); // force the ladder to spawn now
    // Stage the pursuit IN FRAME. The camera sits behind the car looking
    // toward -z, so units staged at +z (behind the camera) are invisible —
    // the original staging (z+14) showed no police at all. Under SwiftShader
    // only a few frames run during the settle, so staged spots barely drift
    // before capture: put the units ahead/flanking (-z) and the heli low
    // enough to stay inside the frame.
    const spots = [[-6, -10], [6, -12], [-8, -20], [8, -22], [0, -30], [-5, -16]];
    G.police.cars.forEach((u, i) => {
      const [ox, oz] = spots[i % spots.length];
      u.v.x = p.x + ox; u.v.z = p.z + oz;
      u.v.speed = 34; u.v.heading = 0;
    });
    if (G.police.heli) { G.police.heli.v.x = p.x + 14; G.police.heli.v.z = p.z - 40; G.police.heli.v.y = 12; }
    G.camYaw = Math.PI; G.camDist = 13; G.camHeight = 4.5;
    G.spawnSmoke(p.x - 3, 0.4, p.z - 4, 2.2, 0.6, 0xcfd4da);
    G.spawnSmoke(p.x + 3, 0.4, p.z - 3, 2.2, 0.6, 0xcfd4da);
  } else if (name === 'street') {
    G.dayTime = 21 * 60 + 30;
    p.x = 4; p.z = -60; p.heading = Math.PI;
    p.mesh.position.set(p.x, 0, p.z);
    const taxi = createVehicle(G, 'taxi', 8, -52, Math.PI / 2, { parked: true });
    void taxi;
    for (let i = 0; i < 6; i++) {
      const ped = G.peds[i * 7];
      if (ped) { ped.x = -4 + i * 3; ped.z = -52 - (i % 3) * 4; ped.state = 'walk'; }
    }
    G.camYaw = Math.PI + 0.4; G.camDist = 7; G.camHeight = 2.6;
    G.hud.setPrompt('<b>F</b> STEAL SUNLINE CAB');
  } else if (name === 'mission') {
    G.dayTime = 17 * 60 + 30;
    const car = createVehicle(G, 'sedan', -160, -166, Math.PI / 2, { color: 0x2f6fd9 });
    G.enterVehicle(car, true);
    startRace(G, 3, 'shot');
    // Rivals spawn behind the start line (-x), i.e. behind the camera, so
    // the original shot showed none. Move them ahead (+x, the camera's
    // forward) so the race reads; the countdown barely ticks under
    // SwiftShader, so they stay where staged.
    G.race.rivals.forEach((r, i) => {
      r.v.x = p.x + 12 + i * 8; r.v.z = p.z + (i === 1 ? 2 : i === 2 ? -1 : -2);
      r.v.heading = Math.PI / 2;
      r.v.mesh.position.set(r.v.x, 0, r.v.z);
      r.v.mesh.rotation.y = r.v.heading;
    });
    G.race.countdown = 2.5;
    G.camYaw = -Math.PI / 2 + Math.PI; G.camDist = 12; G.camHeight = 4;
  } else if (name === 'title') {
    G.dayTime = 18 * 60 + 45;
    G.state = 'title';
    // startGame() (run before applyShot) hid the title overlay and showed
    // the HUD; a title shot must show the actual title screen instead.
    G.hud.showScreen('title');
    document.getElementById('hud').style.display = 'none';
    G.camYaw = 0.6; G.camDist = 90; G.camHeight = 42;
  }
}
