// Pure geometry and animation functions, shared by the widget and its tests.
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const mod = (v, n) => ((v % n) + n) % n;
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);

export function geometry(viewport, safe = {}) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const size = Math.min(clamp(Math.min(width, height) * .36, 116, 176), width * .55, height * .55);
  const carHeight = size * .43;
  const inset = carHeight / 2 + 12;
  const left = (viewport.left || 0) + (safe.left || 0) + inset;
  const top = (viewport.top || 0) + (safe.top || 0) + inset;
  const right = Math.max(left, (viewport.left || 0) + width - (safe.right || 0) - inset);
  const bottom = Math.max(top, (viewport.top || 0) + height - (safe.bottom || 0) - inset);
  const radius = Math.min(size, (right - left) / 2, (bottom - top) / 2);
  const horizontal = Math.max(0, right - left - 2 * radius);
  const vertical = Math.max(0, bottom - top - 2 * radius);
  const arc = Math.PI * radius / 2;
  return {
    ...viewport, width, height, size, carHeight, left, top, right, bottom, radius,
    lengths: [horizontal, arc, vertical, arc, horizontal, arc, vertical, arc],
    perimeter: 2 * horizontal + 2 * vertical + 4 * arc,
    safe: { left: safe.left || 0, top: safe.top || 0, right: safe.right || 0, bottom: safe.bottom || 0 },
  };
}

// Start on the bottom edge, facing left. The body always remains a side profile.
export function trackPose(g, distance) {
  let d = mod(distance, g.perimeter || 1);
  let segment = 0;
  while (segment < 7 && d > g.lengths[segment]) d -= g.lengths[segment++];
  const t = g.lengths[segment] ? d / g.lengths[segment] : 0;
  const { left: l, right: r, top, bottom: b, radius: c } = g;
  let x, y, angle;
  if (segment === 0) { x = mix(r - c, l + c, t); y = b; angle = 0; }
  if (segment === 2) { x = l; y = mix(b - c, top + c, t); angle = 90; }
  if (segment === 4) { x = mix(l + c, r - c, t); y = top; angle = 180; }
  if (segment === 6) { x = r; y = mix(top + c, b - c, t); angle = 270; }
  if (segment % 2) {
    const corner = (segment - 1) / 2;
    const a = (90 + 90 * corner + 90 * t) * Math.PI / 180;
    const centers = [[l + c, b - c], [l + c, top + c], [r - c, top + c], [r - c, b - c]];
    x = centers[corner][0] + Math.cos(a) * c;
    y = centers[corner][1] + Math.sin(a) * c;
    angle = 90 * corner + 90 * t;
  }
  const a = angle * Math.PI / 180;
  return { x, y, angle, nx: Math.sin(a), ny: -Math.cos(a) };
}

// Clamp the actual rotated rectangle, not just its center. Corners and stunts
// therefore fit narrow/tall/short screens and the visual viewport after zoom.
export function contain(g, pose) {
  const a = pose.angle * Math.PI / 180;
  const halfX = (Math.abs(Math.cos(a)) * g.size + Math.abs(Math.sin(a)) * g.carHeight) / 2 + 4;
  const halfY = (Math.abs(Math.sin(a)) * g.size + Math.abs(Math.cos(a)) * g.carHeight) / 2 + 4;
  const l = (g.left - g.carHeight / 2 - 12) + halfX;
  const r = g.right + g.carHeight / 2 + 12 - halfX;
  const top = g.top - g.carHeight / 2 - 12 + halfY;
  const b = g.bottom + g.carHeight / 2 + 12 - halfY;
  return { ...pose, x: clamp(pose.x, Math.min(l, r), Math.max(l, r)), y: clamp(pose.y, Math.min(top, b), Math.max(top, b)) };
}

export function gesture(g, pose, dx, dy) {
  const inward = Math.max(0, dx * pose.nx + dy * pose.ny);
  const threshold = clamp(Math.min(g.width, g.height) * .2, 66, 112);
  return { inward, kind: inward < 18 ? null : inward < threshold ? 'kickflip' : 'ramp' };
}

export function flightPose(g, flight, progress) {
  const t = clamp(progress, 0, 1);
  const end = trackPose(g, flight.to);
  const start = flight.start;
  const turn = mod(end.angle - start.angle + 180, 360) - 180;
  const arc = Math.sin(Math.PI * t);
  const height = Math.min(g.size * (flight.kind === 'ramp' ? 1.05 : flight.kind === 'hop' ? .25 : .6), Math.min(g.width, g.height) * .27);
  const ease = smooth(t);
  const pose = {
    x: mix(start.x, end.x, ease) + mix(start.nx, end.nx, ease) * arc * height,
    y: mix(start.y, end.y, ease) + mix(start.ny, end.ny, ease) * arc * height,
    angle: start.angle + turn * ease + (flight.kind === 'ramp' ? 22 * arc : 0),
    roll: flight.kind === 'kickflip' ? 360 * smooth(clamp((t - .08) / .8, 0, 1)) : 0,
    nx: end.nx, ny: end.ny,
  };
  // Avoid Math.sin(PI) residues at landing and reset roll to exactly upright.
  if (t === 1) return { ...contain(g, end), roll: 0 };
  return contain(g, pose);
}

export function spring(state, target, seconds) {
  const steps = Math.ceil(Math.min(Math.max(seconds, 0), .1) * 120);
  if (!steps) return state;
  const dt = Math.min(seconds, .1) / steps;
  let { value, velocity } = state;
  for (let i = 0; i < steps; i++) {
    velocity += (-380 * (value - target) - 28 * velocity) * dt;
    value += velocity * dt;
  }
  return { value, velocity };
}
