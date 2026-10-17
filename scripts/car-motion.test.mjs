import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, trackPose, contain, flightPose, gesture, spring } from '../public/scripts/car-motion.mjs';

const screens = [[240, 320], [320, 568], [390, 844], [844, 390], [768, 1024], [1280, 720], [2560, 1080], [3440, 1440], [500, 200], [200, 500]];
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

test('every stunt stays visible and ends exactly upright on the perimeter', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height });
    for (let i = 0; i < 24; i++) for (const kind of ['kickflip', 'ramp', 'hop']) {
      const distance = g.perimeter * i / 24;
      const start = contain(g, trackPose(g, distance));
      start.x += start.nx * 70; start.y += start.ny * 70;
      const flight = { kind, start, to: distance + g.size * 1.35 };
      for (let f = 0; f <= 60; f++) inside(g, flightPose(g, flight, f / 60));
      assert.deepEqual(flightPose(g, flight, 1), { ...contain(g, trackPose(g, flight.to)), roll: 0 });
    }
  }
});

test('only inward pulls launch, with consistent short/long gestures on all four walls', () => {
  const g = geometry({ width: 390, height: 844 });
  for (const [nx, ny] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const pose = { nx, ny };
    assert.equal(gesture(g, pose, nx * 8, ny * 8).kind, null);
    assert.equal(gesture(g, pose, nx * 40, ny * 40).kind, 'kickflip');
    assert.equal(gesture(g, pose, nx * 130, ny * 130).kind, 'ramp');
    assert.equal(gesture(g, pose, nx * -130, ny * -130).kind, null);
    assert.equal(gesture(g, pose, ny * 130, -nx * 130).kind, null);
  }
});

test('air springs absorb a landing and settle across low and high frame rates', () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) {
    let s = { value: 0, velocity: 90 };
    for (let t = 0; t < 3; t += dt) s = spring(s, -5, dt);
    assert(Math.abs(s.value + 5) < .01);
    assert(Math.abs(s.velocity) < .01);
  }
});
