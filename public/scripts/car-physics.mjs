import { clamp, mod, smooth, contain } from './car-motion.mjs';
export { geometry, trackPose, contain, clamp, mod } from './car-motion.mjs';

export const GRAVITY = 9.81;
export const ENVIRONMENTS = Object.freeze({
  normal: { label: '노말', speed: 38, acceleration: 70, height: 'ride', stiffness: 380, damping: 28, bump: 0, color: '#a4bac4', track: 2, dash: '' },
  sport: { label: '스포츠', speed: 66, acceleration: 150, height: 'low', stiffness: 560, damping: 36, bump: .15, color: '#85c9d6', track: 3, dash: '' },
  offroad: { label: '오프로드', speed: 27, acceleration: 52, height: 'high', stiffness: 260, damping: 23, bump: 1.9, color: '#9c9b87', track: 7, dash: '3 8' },
  mud: { label: '머드', speed: 20, acceleration: 30, height: 'high', stiffness: 290, damping: 30, bump: 1.1, color: '#997654', track: 9, dash: '' },
});

export function createFlight(g, pose, kind = 'drop', velocity = {}) {
  const scale = g.size / 4.84; // Veracruz length: CSS pixels per world metre.
  const gravity = GRAVITY * scale;
  const start = contain(g, pose);
  const vx = clamp(velocity.x || 0, -g.size * 3, g.size * 3);
  const vy = kind === 'drop' ? clamp(velocity.y || 0, -g.size * 2, g.size * 3)
    : -Math.sqrt(2 * gravity * g.size * (kind === 'hop' ? .24 : .8));
  return { ...start, kind, scale, gravity, vx, vy, thrust: 0, elapsed: 0, roll: 0,
    initialAngle: mod(start.angle + 180, 360) - 180,
    targetX: clamp(start.x + vx * .3, g.left + g.radius, g.right - g.radius),
    phase: 'fall', lit: false, landed: false };
}

// Gravity is global-down, independent of the wall normal and environment.
// A stopping-distance controller ignites the landing jets before contact.
export function stepFlight(g, state, seconds) {
  if (state.landed) return state;
  const f = { ...state };
  const steps = Math.ceil(clamp(seconds, 0, .1) * 120);
  if (!steps) return f;
  const dt = Math.min(seconds, .1) / steps;
  for (let i = 0; i < steps && !f.landed; i++) {
    f.elapsed += dt;
    const remaining = Math.max(0, g.bottom - f.y);
    const stopping = Math.max(0, f.vy) ** 2 / (2 * f.gravity * 3.5);
    if (f.vy >= 0 && remaining <= stopping + g.size * .6) f.lit = true;
    const aligned = f.elapsed >= (f.kind === 'kickflip' ? .96 : .55) && Math.abs(f.targetX - f.x) < 3;
    const desiredVy = aligned ? Math.min(remaining * 3, Math.sqrt(2 * f.gravity * 2 * remaining)) : 0;
    f.thrust = f.lit ? clamp(f.gravity + 12 * (f.vy - desiredVy), 0, f.gravity * 5) : 0;
    const ax = clamp((f.targetX - f.x) * 12 - f.vx * 7, -f.gravity * 1.8, f.gravity * 1.8);
    f.x += f.vx * dt + ax * dt * dt / 2;
    f.y += f.vy * dt + (f.gravity - f.thrust) * dt * dt / 2;
    f.vx += ax * dt;
    f.vy += (f.gravity - f.thrust) * dt;
    f.angle = f.initialAngle * (1 - smooth(clamp(f.elapsed / .55, 0, 1)));
    f.roll = f.kind === 'kickflip' ? 360 * smooth(clamp(f.elapsed / .92, 0, 1)) : 0;
    const bounded = contain(g, f);
    if (bounded.y > f.y && f.vy < 0) f.vy = 0; // Ceiling contact.
    f.x = bounded.x; f.y = bounded.y;
    f.phase = f.lit ? 'braking' : f.vy < 0 ? 'ascent' : 'fall';
    if (aligned && g.bottom - f.y < 1.5 && Math.abs(f.vy) < 25) {
      f.impactSpeed = Math.abs(f.vy) / f.scale;
      Object.assign(f, { x: f.targetX, y: g.bottom, angle: 0, roll: 0, vx: 0, vy: 0, thrust: 0, phase: 'attached', landed: true });
    }
  }
  return f;
}

export function bottomDistance(g, x) { return clamp(g.right - g.radius - x, 0, g.lengths[0]); }

export function spring(state, target, seconds, settings = ENVIRONMENTS.normal) {
  const steps = Math.ceil(Math.min(Math.max(seconds, 0), .1) * 120);
  if (!steps) return state;
  const dt = Math.min(seconds, .1) / steps;
  let { value, velocity } = state;
  for (let i = 0; i < steps; i++) {
    velocity += (-settings.stiffness * (value - target) - settings.damping * velocity) * dt;
    value += velocity * dt;
  }
  return { value, velocity };
}
