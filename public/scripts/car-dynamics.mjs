import { clamp, mod, contain, trackPose } from './car-motion.mjs';
export { geometry, trackPose, contain, clamp, mod } from './car-motion.mjs';
export { spring } from './car-physics.mjs';

export const GRAVITY = 9.81;
export const ENVIRONMENTS = Object.freeze({
  normal: { label: '노말', speed: 100, acceleration: 115, height: 'ride', stiffness: 380, damping: 28, bump: 0, color: '#a4bac4', track: 2, dash: '' },
  sport: { label: '스포츠', speed: 155, acceleration: 180, height: 'low', stiffness: 560, damping: 36, bump: .15, color: '#85c9d6', track: 3, dash: '' },
  offroad: { label: '오프로드', speed: 78, acceleration: 85, height: 'high', stiffness: 260, damping: 23, bump: 1.9, color: '#9c9b87', track: 7, dash: '3 8' },
  mud: { label: '머드', speed: 64, acceleration: 60, height: 'high', stiffness: 290, damping: 30, bump: 1.1, color: '#997654', track: 9, dash: '' },
});

export function tangent(pose, speed) {
  const a = pose.angle * Math.PI / 180;
  return { x: -Math.cos(a) * speed, y: -Math.sin(a) * speed };
}

// A one-second 0–100 km/h acceleration in the car's 4.84 m world scale.
export function boostSpeed(g) { return 100 / 3.6 * g.size / 4.84; }
export function stepDrive(g, state, seconds, environment = ENVIRONMENTS.normal, boosted = false) {
  const dt = clamp(seconds, 0, .1);
  const desired = boosted ? boostSpeed(g) : environment.speed;
  const acceleration = boosted ? boostSpeed(g) : environment.acceleration;
  const next = state.speed + clamp(desired - state.speed, -environment.acceleration * dt, acceleration * dt);
  const travel = (state.speed + next) * .5 * dt;
  return { speed: next, acceleration: dt ? (next - state.speed) / dt : 0, travel,
    distance: mod(state.distance + travel, g.perimeter) };
}

// The next entry into a rounded wall corner, including perimeter wraparound.
export function cornerCrossed(g, distance, travel) {
  let end = 0;
  for (let i = 0; i < 8; i++) {
    end += g.lengths[i];
    if (i % 2 === 0 && mod(end - distance - .000001, g.perimeter) + .000001 <= travel) return true;
  }
  return false;
}

export function createFlight(g, pose, kind = 'drop', velocity = {}) {
  const scale = g.size / 4.84, gravity = GRAVITY * scale;
  const start = contain(g, pose);
  const vx = clamp(velocity.x || 0, -g.size * 8, g.size * 8);
  const jump = Math.sqrt(2 * gravity * Math.min(g.size * .85, (g.bottom - g.top) * .4));
  const vy = kind === 'drop' ? clamp(velocity.y || 0, -g.size * 6, g.size * 8) : Math.min(velocity.y || 0, -jump);
  return { ...start, kind, scale, gravity, vx, vy, thrust: 0, frontThrust: 0, rearThrust: 0,
    angle: mod(start.angle + 180, 360) - 180, angularVelocity: 0, elapsed: 0, roll: 0,
    targetX: clamp(start.x + vx * .65, g.left + g.radius, g.right - g.radius),
    phase: vy < 0 ? 'ascent' : 'fall', lit: false, landed: false };
}

// Fixed 240 Hz integration: ballistic motion until stopping distance demands
// thrust. Horizontal momentum is only removed by the landing controller.
export function stepFlight(g, state, seconds) {
  if (state.landed) return state;
  const f = { ...state }, duration = clamp(seconds, 0, .1);
  const steps = Math.ceil(duration * 240), dt = steps ? duration / steps : 0;
  for (let i = 0; i < steps && !f.landed; i++) {
    f.elapsed += dt;
    const remaining = Math.max(0, g.bottom - f.y);
    const stopping = Math.max(0, f.vy) ** 2 / (2 * f.gravity * 3.5);
    if (f.vy >= 0 && remaining <= stopping + g.size * .22) f.lit = true;
    const ready = f.elapsed > (f.kind === 'kickflip' ? 1.05 : .55)
      && Math.abs(f.targetX - f.x) < 4 && Math.abs(f.vx) < 12 && Math.abs(f.angle) < 3;
    const desiredVy = ready ? Math.min(remaining * 3, Math.sqrt(2 * f.gravity * 1.7 * remaining)) : 0;
    f.thrust = f.lit ? clamp(f.gravity + 11 * (f.vy - desiredVy), 0, f.gravity * 5) : 0;
    const ax = f.lit ? clamp((f.targetX - f.x) * 8 - f.vx * 6, -f.gravity * 3, f.gravity * 3) : 0;
    const ay = f.gravity - f.thrust;
    f.x += f.vx * dt + ax * dt * dt / 2;
    f.y += f.vy * dt + ay * dt * dt / 2;
    f.vx += ax * dt; f.vy += ay * dt;

    // Pitch corrections and independently phased front/rear jet pulses.
    const targetAngle = f.vy < -20 && !f.lit ? 12 : 0;
    const torque = clamp((targetAngle - f.angle) * 42 - f.angularVelocity * 12, -1700, 1700);
    f.angularVelocity += torque * dt;
    f.angle += f.angularVelocity * dt;
    const impulse = f.kind !== 'drop' && f.elapsed < .16 ? 1 - f.elapsed / .16 : 0;
    const total = Math.max(f.thrust / f.gravity, impulse * 2.6);
    const correction = clamp(torque / 700, -.65, .65);
    const pulse = Math.sin(f.elapsed * 19) * .15 + Math.sin(f.elapsed * 7) * .08;
    const split = clamp(.5 + correction * .5 + pulse, .12, .88);
    f.frontThrust = total * split; f.rearThrust = total * (1 - split);
    const t = clamp(f.elapsed / .96, 0, 1);
    f.roll = f.kind === 'kickflip' ? 360 * (t * t * (3 - 2 * t)) : 0;
    const bounded = contain(g, f);
    if (bounded.x !== f.x) f.vx *= -.16; // Lossy contact, never a horizontal teleport.
    if (bounded.y > f.y && f.vy < 0) f.vy *= -.12;
    f.x = bounded.x; f.y = Math.min(bounded.y, g.bottom);
    f.phase = f.lit ? 'braking' : f.vy < 0 ? 'ascent' : 'fall';
    if (ready && g.bottom - f.y < 1.3 && Math.abs(f.vy) < 24) {
      f.impactSpeed = Math.abs(f.vy) / f.scale;
      Object.assign(f, { y: g.bottom, angle: 0, angularVelocity: 0, roll: 0,
        thrust: 0, frontThrust: 0, rearThrust: 0, phase: 'attached', landed: true });
    }
  }
  return f;
}

export function bottomDistance(g, x) { return clamp(g.right - g.radius - x, 0, g.lengths[0]); }

export function resizeFlight(g, previous, flight) {
  const ratio = g.size / previous.size;
  const x = g.left + (flight.x - previous.left) * (g.right - g.left) / Math.max(1, previous.right - previous.left);
  const y = g.top + (flight.y - previous.top) * (g.bottom - g.top) / Math.max(1, previous.bottom - previous.top);
  return { ...flight, ...contain(g, { ...flight, x, y }), scale: g.size / 4.84, gravity: GRAVITY * g.size / 4.84,
    vx: flight.vx * ratio, vy: flight.vy * ratio, thrust: flight.thrust * ratio,
    targetX: clamp(g.left + (flight.targetX - previous.left) * (g.right - g.left) / Math.max(1, previous.right - previous.left), g.left + g.radius, g.right - g.radius) };
}

// Pointer samples use the most recent movement, not total drag displacement.
export function releaseVelocity(samples, now, size) {
  const recent = samples.filter(s => now - s.time <= 100);
  if (recent.length < 2) return { x: 0, y: 0 };
  const first = recent[0], last = recent[recent.length - 1];
  const dt = (last.time - first.time) / 1000;
  if (dt < .008 || now - last.time > 65) return { x: 0, y: 0 };
  return { x: clamp((last.x - first.x) / dt, -size * 8, size * 8),
    y: clamp((last.y - first.y) / dt, -size * 6, size * 8) };
}
