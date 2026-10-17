import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, trackPose, contain, createFlight, stepFlight, bottomDistance, GRAVITY, ENVIRONMENTS, spring, stepDrive, boostSpeed, tangent, cornerCrossed, releaseVelocity, resizeFlight, roadPath } from '../public/scripts/car-dynamics.mjs';
import { BOOST_CHARGE_MS, isCarHome, chargedBoost, shouldRamp } from '../public/scripts/car-controls.mjs';

const screens = [[240, 320], [320, 568], [390, 844], [844, 390], [768, 1024], [1280, 720], [2560, 1080], [3440, 1440], [500, 200], [200, 500]];

test('the car is available only on the unfiltered home feed, including explicit ALL', () => {
  for (const path of ['/', '/#main-content', '/?utm_source=test', '/?category=ALL']) assert(isCarHome(new URL(path, 'https://lucas-jang.github.io')));
  for (const path of ['/?category=DEV', '/?category=LIFE', '/about/', '/archive/', '/search/', '/posts/test/', '/__car-qa.html']) assert(!isCarHome(new URL(path, 'https://lucas-jang.github.io')));
});

test('charge power and duration grow smoothly; only the exact full charge can arm a ramp', () => {
  let previous = chargedBoost(0);
  for (let milliseconds = 1; milliseconds < BOOST_CHARGE_MS; milliseconds++) {
    const profile = chargedBoost(milliseconds);
    assert(profile.power > previous.power && profile.duration > previous.duration);
    assert(!profile.full); assert(!shouldRamp(profile, 10, true)); previous = profile;
  }
  const full = chargedBoost(BOOST_CHARGE_MS);
  assert(full.full); assert.equal(full.power, 1);
  assert(!shouldRamp(full, .99, true)); assert(!shouldRamp(full, 1, false));
  assert(shouldRamp(full, 1, true)); assert.deepEqual(chargedBoost(10000), full);
  assert.deepEqual(chargedBoost(-100), chargedBoost(0));
});

test('partial-charge boost has lower speed and retains coast-down momentum', () => {
  const g = geometry({ width: 1280, height: 720 });
  const speeds = [0, 250, 650, 1000].map(ms => {
    const profile = chargedBoost(ms); let s = { speed: 100, distance: 0 };
    for (let i = 0; i < 120; i++) s = stepDrive(g, s, 1 / 60, ENVIRONMENTS.normal, profile.power);
    const next = stepDrive(g, s, 1 / 60);
    assert(next.speed < s.speed && next.speed > 100);
    return s.speed;
  });
  assert(speeds.every((v, i) => !i || v > speeds[i - 1]));
});

test('the rendered road has exact broad circular arcs and continuous corner tangents', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height });
    assert(g.radius >= Math.min(g.size, (g.right - g.left) / 2, (g.bottom - g.top) / 2));
    assert.equal((roadPath(g).match(/A/g) || []).length, 4);
    assert(!roadPath(g).includes('NaN')); assert(roadPath(g).endsWith('Z'));
    let distance = 0;
    for (const length of g.lengths) {
      distance += length;
      const before = trackPose(g, distance - .001), after = trackPose(g, distance + .001);
      assert(Math.hypot(before.x - after.x, before.y - after.y) <= .00201);
      const angle = Math.abs(((after.angle - before.angle + 540) % 360) - 180);
      assert(angle < .01);
    }
  }
});
test('the already-deployed cached client keeps its original animation API', async () => {
  const previous = await import('../public/scripts/car-motion.mjs');
  const g = previous.geometry({ width: 390, height: 844 });
  const oldFlight = { kind: 'kickflip', start: previous.trackPose(g, 0), to: 100 };
  assert.deepEqual(previous.flightPose(g, oldFlight, 1), { ...previous.contain(g, previous.trackPose(g, 100)), roll: 0 });
});
function inside(g, pose) {
  const a = pose.angle * Math.PI / 180;
  const x = (Math.abs(Math.cos(a)) * g.size + Math.abs(Math.sin(a)) * g.carHeight) / 2;
  const y = (Math.abs(Math.sin(a)) * g.size + Math.abs(Math.cos(a)) * g.carHeight) / 2;
  const left = (g.left - g.carHeight / 2 - 12), top = (g.top - g.carHeight / 2 - 12);
  const right = g.right + g.carHeight / 2 + 12, bottom = g.bottom + g.carHeight / 2 + 12;
  assert(pose.x - x >= left - .001 && pose.x + x <= right + .001, JSON.stringify({ g, pose }));
  assert(pose.y - y >= top - .001 && pose.y + y <= bottom + .001, JSON.stringify({ g, pose }));
}

test('the full rounded perimeter fits portrait, landscape, ultrawide, and zoomed viewports', () => {
  for (const [width, height] of screens) for (const safe of [{}, { top: 24, right: 10, bottom: 20, left: 10 }]) {
    const g = geometry({ width, height, left: 20, top: 14 }, safe);
    for (let i = 0; i < 1000; i++) inside(g, contain(g, trackPose(g, g.perimeter * i / 1000)));
    assert.deepEqual(trackPose(g, g.perimeter), trackPose(g, 0));
  }
});

test('gravity drops and stunts stay visible and land gently on the floor, from every wall', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height });
    for (let i = 0; i < 24; i++) for (const kind of ['drop', 'kickflip', 'ramp']) {
      const distance = g.perimeter * i / 24;
      const start = contain(g, trackPose(g, distance));
      start.x += start.nx * 70; start.y += start.ny * 70;
      let flight = createFlight(g, start, kind);
      for (let time = 0; time < 12 && !flight.landed; time += 1 / 60) {
        flight = stepFlight(g, flight, 1 / 60);
        inside(g, flight);
      }
      assert(flight.landed, JSON.stringify({ width, height, kind, flight }));
      assert.equal(flight.roll, 0); assert.equal(flight.angle, 0);
      assert(flight.impactSpeed < .8, JSON.stringify(flight));
      const attached = trackPose(g, bottomDistance(g, flight.x));
      assert(Math.hypot(attached.x - flight.x, attached.y - flight.y) < 1.5);
    }
  }
});

test('ballistic release preserves horizontal inertia and exact gravity before ignition', () => {
  const g = geometry({ width: 1280, height: 900 });
  for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) {
    const start = createFlight(g, { x: 600, y: 150, angle: 0 }, 'drop', { x: 150, y: 20 });
    let f = start;
    for (let i = 0; i < Math.round(.2 / dt); i++) f = stepFlight(g, f, dt);
    assert.equal(f.thrust, 0); assert.equal(f.vx, 150);
    assert(Math.abs(f.x - start.x - 150 * .2) < 1e-6);
    assert(Math.abs(f.vy - 20 - f.gravity * .2) < 1e-6);
    assert(Math.abs(f.y - start.y - 20 * .2 - .5 * f.gravity * .2 ** 2) < 1e-6);
  }
});

test('boost reaches 100 km/h at one second and coasts down without a velocity reset', () => {
  for (const [width, height] of screens) for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) {
    const g = geometry({ width, height });
    let s = { speed: 0, distance: g.perimeter - 1 };
    for (let i = 0; i < Math.round(1 / dt); i++) s = stepDrive(g, s, dt, ENVIRONMENTS.normal, true);
    assert(Math.abs(s.speed - boostSpeed(g)) < 1e-6);
    const before = s.speed;
    s = stepDrive(g, s, dt, ENVIRONMENTS.normal, false);
    assert(Math.abs(before - s.speed - ENVIRONMENTS.normal.acceleration * dt) < 1e-6);
    assert(s.distance >= 0 && s.distance < g.perimeter);
  }
});

test('corner trigger detects every wall, wraparound, and high-speed frame crossings', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height }); let end = 0;
    for (let i = 0; i < 8; i++) {
      end += g.lengths[i];
      if (i % 2 === 0) assert(cornerCrossed(g, (end - 3 + g.perimeter) % g.perimeter, 6));
    }
    assert(cornerCrossed(g, g.perimeter - 2, g.lengths[0] + 4));
  }
});

test('maximum boost momentum lands safely at 10–120 FPS from all four walls', () => {
  for (const [width, height] of screens) for (const dt of [1 / 120, 1 / 30, .1]) {
    const g = geometry({ width, height });
    for (let side = 0; side < 4; side++) {
      const p = trackPose(g, g.perimeter * side / 4);
      let f = createFlight(g, p, 'ramp', tangent(p, boostSpeed(g) * .8));
      let different = false;
      for (let t = 0; t < 15 && !f.landed; t += dt) {
        f = stepFlight(g, f, dt); inside(g, f);
        different ||= Math.abs(f.frontThrust - f.rearThrust) > .2;
        assert(Number.isFinite(f.angle) && Number.isFinite(f.vx));
      }
      assert(f.landed, JSON.stringify({ width, height, dt, side, f }));
      assert(different); assert(f.impactSpeed < .8);
    }
  }
});

test('throw velocity uses recent input and becomes zero after holding still', () => {
  const samples = [{ x: 0, y: 0, time: 0 }, { x: 200, y: 100, time: 1000 }, { x: 220, y: 110, time: 1050 }];
  assert.deepEqual(releaseVelocity(samples, 1050, 176), { x: 400, y: 200 });
  assert.deepEqual(releaseVelocity(samples, 1200, 176), { x: 0, y: 0 });
});

test('rotation and zoom preserve world momentum and active flip progress until a safe landing', () => {
  const old = geometry({ width: 1280, height: 720 });
  const flight = stepFlight(old, createFlight(old, { x: 550, y: 250, angle: 90 }, 'kickflip', { x: 200 }), .1);
  for (const [width, height] of screens) {
    const g = geometry({ width, height }); let f = resizeFlight(g, old, flight);
    assert(Math.abs(f.vx / f.scale - flight.vx / flight.scale) < 1e-9);
    assert(Math.abs(f.vy / f.scale - flight.vy / flight.scale) < 1e-9);
    assert.equal(f.elapsed, flight.elapsed); assert.equal(f.roll, flight.roll);
    inside(g, f);
    for (let t = 0; t < 12 && !f.landed; t += 1 / 60) f = stepFlight(g, f, 1 / 60);
    assert(f.landed); assert(f.impactSpeed < .8);
  }
});

test('release has 9.81 m/s² world-down acceleration before the landing jets ignite', () => {
  const g = geometry({ width: 1280, height: 900 });
  const initial = createFlight(g, { x: 600, y: 150, angle: 90 }, 'drop');
  const next = stepFlight(g, initial, .1);
  assert.equal(next.thrust, 0);
  assert(Math.abs(next.vy / next.scale - GRAVITY * .1) < .00001);
  assert(Math.abs((next.y - initial.y) / next.scale - .5 * GRAVITY * .1 ** 2) < .00001);
});

test('landing controller survives a thrown car and low frame rates without hard impacts', () => {
  const g = geometry({ width: 390, height: 844 });
  for (const dt of [1 / 120, 1 / 30, .1]) for (const velocity of [{ x: 500, y: 500 }, { x: -500, y: -300 }]) {
    let f = createFlight(g, { x: 180, y: 180, angle: 180 }, 'drop', velocity);
    let ignited = false;
    for (let t = 0; t < 12 && !f.landed; t += dt) { f = stepFlight(g, f, dt); ignited ||= f.thrust > f.gravity; }
    assert(f.landed); assert(ignited); assert(f.impactSpeed < .8);
  }
});

test('air springs absorb a landing and settle across low and high frame rates', () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) for (const environment of Object.values(ENVIRONMENTS)) {
    let s = { value: 0, velocity: 90 };
    for (let t = 0; t < 3; t += dt) s = spring(s, -5, dt, environment);
    assert(Math.abs(s.value + 5) < .01);
    assert(Math.abs(s.velocity) < .01);
  }
});
