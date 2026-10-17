import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, trackPose, contain, createFlight, stepFlight, bottomDistance, GRAVITY, ENVIRONMENTS, spring } from '../public/scripts/car-physics.mjs';

const screens = [[240, 320], [320, 568], [390, 844], [844, 390], [768, 1024], [1280, 720], [2560, 1080], [3440, 1440], [500, 200], [200, 500]];
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
    for (let i = 0; i < 16; i++) for (const kind of ['drop', 'kickflip', 'ramp', 'hop']) {
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
      assert(Math.hypot(attached.x - flight.x, attached.y - flight.y) < .001);
    }
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
