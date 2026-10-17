import { clamp } from './car-motion.mjs';

// Coordinates lie on the photographed bumper trim, rocker panels and roof rack.
// Both visible sides use these same anchors, inside the suspension/body shell.
export const PORTS = Object.freeze([
  { id: 'fore', x: .035, y: .67, nx: -1, ny: 0 },
  { id: 'aft', x: .963, y: .65, nx: 1, ny: 0 },
  { id: 'lift-front', x: .34, y: .735, nx: 0, ny: 1 },
  { id: 'lift-rear', x: .65, y: .735, nx: 0, ny: 1 },
  { id: 'roof', x: .51, y: .115, nx: 0, ny: -1 },
]);

export function projectPort(g, pose, suspension, port, side = 1) {
  const pitch = (suspension.pitch || 0) * Math.PI / 180;
  const roll = (pose.roll || 0) * Math.PI / 180;
  const yaw = Math.sin(roll) * 10 * Math.PI / 180;
  const angle = pose.angle * Math.PI / 180;
  const x = (port.x - .5) * g.size, y = (port.y - .58) * g.carHeight;
  const px = Math.cos(pitch) * x - Math.sin(pitch) * y;
  const py = Math.sin(pitch) * x + Math.cos(pitch) * y + (suspension.heave || 0);
  const z = side * (g.size * .09 + 1);
  const rx = Math.cos(yaw) * px + Math.sin(yaw) * z;
  const rz = -Math.sin(yaw) * px + Math.cos(yaw) * z;
  const ry = Math.cos(roll) * py - Math.sin(roll) * rz;
  const depth = Math.sin(roll) * py + Math.cos(roll) * rz;
  const perspective = 700 / (700 - depth);
  const dx = rx * perspective, dy = (g.carHeight * .08 + ry) * perspective;
  return { x: pose.x + Math.cos(angle) * dx - Math.sin(angle) * dy,
    y: pose.y + Math.sin(angle) * dx + Math.cos(angle) * dy };
}

// Select the outward-facing flush port and vector its exhaust toward the wall.
// The projected opposite side fades in during a roll instead of jumping origin.
export function thrusterCommands(g, pose, suspension, flight, boost = 0) {
  const angle = (pose.angle + (suspension.pitch || 0)) * Math.PI / 180;
  const roll = (pose.roll || 0) * Math.PI / 180;
  const channels = [
    { dx: -1, dy: 0, power: flight?.jets?.left || 0 },
    { dx: 1, dy: 0, power: flight?.jets?.right || 0 },
    { dx: 0, dy: -1, power: flight?.jets?.up || 0 },
    { dx: 0, dy: 1, power: flight?.jets?.down || 0 },
  ];
  const forces = new Map(PORTS.map(p => [p.id, { dx: 0, dy: 0 }]));
  function add(port, dx, dy, power) {
    const force = forces.get(port.id); force.dx += dx * power; force.dy += dy * power;
  }
  for (const channel of channels) {
    if (channel.power <= .001) continue;
    const ranked = PORTS.map(port => {
      const nx = Math.cos(angle) * port.nx - Math.sin(angle) * port.ny * Math.cos(roll);
      const ny = Math.sin(angle) * port.nx + Math.cos(angle) * port.ny * Math.cos(roll);
      return { port, score: nx * channel.dx + ny * channel.dy };
    }).sort((a, b) => b.score - a.score);
    let selected = ranked.filter(p => p.score > ranked[0].score - .02);
    if (ranked[0].score < .15) {
      // Edge-on rolls: choose the exposed end instead of emitting through paint.
      selected = ranked.map(item => {
        const p = projectPort(g, pose, suspension, item.port);
        return { ...item, score: (p.x - pose.x) * channel.dx + (p.y - pose.y) * channel.dy };
      }).sort((a, b) => b.score - a.score).slice(0, 1);
    }
    const sum = (flight?.frontThrust || 0) + (flight?.rearThrust || 0);
    const frontShare = sum ? flight.frontThrust / sum : .5;
    for (const { port } of selected) {
      const share = selected.length === 2 && selected.every(p => p.port.id.startsWith('lift-'))
        ? port.id === 'lift-front' ? frontShare : 1 - frontShare : 1 / selected.length;
      add(port, channel.dx, channel.dy, channel.power * share);
    }
  }
  if (boost > 0) add(PORTS[1], Math.cos(angle), Math.sin(angle), boost * 2);
  const result = [];
  for (const port of PORTS) {
    const force = forces.get(port.id), magnitude = Math.hypot(force.dx, force.dy);
    if (magnitude < .01) continue;
    for (const side of [1, -1]) {
      const weight = (1 + side * Math.cos(roll)) / 2;
      if (weight < .01) continue;
      result.push({ key: `${port.id}:${side}`, port: port.id, side,
        ...projectPort(g, pose, suspension, port, side), dx: force.dx / magnitude, dy: force.dy / magnitude,
        power: clamp(magnitude, 0, 3.5) * weight });
    }
  }
  return result;
}
