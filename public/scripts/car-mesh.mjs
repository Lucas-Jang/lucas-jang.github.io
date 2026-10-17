import { CAR_PROFILE } from './car-body-shape.mjs?v=20261017-7';
import { BODY_DEPTH, projectPoint } from './car-projection.mjs?v=20261017-12';
import { PORTS } from './car-thrusters.mjs?v=20261017-12';

const IMAGE_RATIO = 332 / 960;
export const MESH_PADDING = 40;

function cross(a, b, c) {
  const u = [b.cameraX - a.cameraX, b.cameraY - a.cameraY, b.depth - a.depth];
  const v = [c.cameraX - a.cameraX, c.cameraY - a.cameraY, c.depth - a.depth];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function faceVisible(points) {
  const normal = cross(points[0], points[1], points[2]), p = points[0];
  const perspective = p.perspective ?? 1;
  return (normal[0] * -p.cameraX + normal[1] * -p.cameraY - normal[2] * p.depth) * perspective + normal[2] * 700 > .00001;
}

function shade(color, points) {
  const n = cross(points[0], points[1], points[2]), length = Math.hypot(...n) || 1;
  const light = Math.max(0, (-n[0] * .25 - n[1] * .45 + n[2] * .86) / length);
  const factor = .69 + .31 * light;
  return `rgb(${color.map(c => Math.round(c * factor)).join(',')})`;
}

// A closed silhouette extrusion and four real tyre cylinders. No independent
// floating CSS planes; every body edge connects identical near/far vertices.
export function meshFaces(g, pose, suspension, wheelAngle = 0) {
  const faces = [], depth = g.size * BODY_DEPTH / 2, sideView = Math.abs(Math.sin((pose.roll || 0) * Math.PI / 180)) < 1e-7;
  const mud = Math.max(0,Math.min(1,pose.mudMix ?? (pose.environment === 'mud' ? 1 : 0)));
  const surface = (clean,dirty) => clean.map((v,i)=>v+(dirty[i]-v)*mud);
  const bodyPoint = (u, v, z) => ({ x: (u - .5) * g.size, y: (.0465 - .5) * g.carHeight + v * g.size * IMAGE_RATIO, z });
  function add(points, color, body = true, texture = false, cull = true) {
    const projected = points.map(p => projectPoint(g, pose, suspension, p, p.body ?? body));
    if (cull && !faceVisible(projected)) return;
    faces.push({ points: projected, color: Array.isArray(color) ? shade(color, projected) : color,
      depth: projected.reduce((s, p) => s + p.depth, 0) / projected.length, texture,
      uv: texture ? points.map(p => p.uv) : undefined });
  }
  for (let i = 0; !sideView && i < CAR_PROFILE.length; i++) {
    const p = CAR_PROFILE[i], q = CAR_PROFILE[(i + 1) % CAR_PROFILE.length];
    const x = (p[0] + q[0]) / 2, y = (p[1] + q[1]) / 2;
    const windshield = x > .24 && x < .43 && y < .36;
    const color = windshield ? [77, 96, 104] : y > .58 ? surface([49,60,65],[91,74,55]) : [242, 241, 229];
    const section = (v, t) => {
      const point = bodyPoint(...v, depth * t);
      // A gently crowned roof/bonnet closes the volume without flat side slabs.
      if (v[1] < .5) point.y -= g.size * .022 * (1 - t * t) * Math.sin((pose.roll || 0) * Math.PI / 180) ** 2;
      return point;
    };
    for (let band = 0; band < 6; band++) {
      const a = 1 - band / 3, b = 1 - (band + 1) / 3;
      add([section(p, a), section(p, b), section(q, b), section(q, a)], color);
    }
  }
  // Subdivided affine texture mapping keeps the existing side illustration
  // recognisable and avoids the stretching of one large projected rectangle.
  const columns = sideView ? 1 : 6, rows = sideView ? 1 : 2;
  for (const side of [1, -1]) for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
    const uv = [[col / columns, row / rows], [(col + 1) / columns, row / rows], [(col + 1) / columns, (row + 1) / rows], [col / columns, (row + 1) / rows]];
    const points = uv.map(([u, v]) => ({ ...bodyPoint(u, v, side * depth), uv: [u, v] }));
    if (side < 0) points.reverse();
    add(points, null, true, true);
  }
  for (const x of [.207, .774]) for (const side of [1, -1]) {
    const cx = (x - .5) * g.size, cy = (.6977 - .5) * g.carHeight;
    const radius = g.size * .075, z = side * (depth + g.size * .015), width = g.size * .06;
    const ring = (angle, zz, r = radius) => ({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, z: zz });
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI / 10, b = (i + 1) * Math.PI / 10;
      add([ring(a, z + width / 2), ring(a, z - width / 2), ring(b, z - width / 2), ring(b, z + width / 2)], surface([37,44,49],[101,82,62]), false);
    }
    for (const faceSide of [1, -1]) {
      const zz = z + faceSide * width / 2;
      const disc = Array.from({ length: 20 }, (_, i) => ring(i * Math.PI / 10, zz));
      if (faceSide < 0) disc.reverse();
      add(disc, [49, 60, 67], false);
      const rim = Array.from({ length: 20 }, (_, i) => ring(i * Math.PI / 10, zz + faceSide * .05, radius * .69));
      if (faceSide < 0) rim.reverse();
      add(rim, [184, 196, 201], false);
      for (let spoke = 0; spoke < 5; spoke++) {
        const a = (wheelAngle * Math.PI / 180) + spoke * Math.PI * .4;
        const points = [ring(a - .12, zz + faceSide * .1, radius * .2), ring(a + .12, zz + faceSide * .1, radius * .2),
          ring(a + .07, zz + faceSide * .1, radius * .65), ring(a - .07, zz + faceSide * .1, radius * .65)];
        if (faceSide > 0) points.reverse();
        add(points, [76, 91, 101], false);
      }
      const hub = Array.from({ length: 10 }, (_, i) => ring(i * Math.PI / 5, zz + faceSide * .2, radius * .2));
      if (faceSide < 0) hub.reverse();
      add(hub, [113, 133, 143], false);
    }
    // A visible air spring connects the wheel to the moving shell.
    const anchor = { x: cx, y: -.01 * g.size, z: side * (depth - g.size * .012), body: true };
    const base = { x: cx, y: cy, z: anchor.z, body: false };
    add([{ ...anchor, x: cx - g.size * .02 }, { ...anchor, x: cx + g.size * .02 },
      { ...base, x: cx + g.size * .02 }, { ...base, x: cx - g.size * .02 }], [76, 94, 102], false, false, false);
    const pitch = (suspension.pitch || 0) * Math.PI / 180, pivot = g.carHeight * .08;
    const ax = Math.cos(pitch) * cx - Math.sin(pitch) * (anchor.y - pivot);
    const ay = pivot + Math.sin(pitch) * cx + Math.cos(pitch) * (anchor.y - pivot) + (suspension.heave || 0);
    const bandPoint = (t, dx) => ({x: ax + (cx - ax) * t + dx, y: ay + (cy - ay) * t, z: anchor.z});
    for (let band = 0; band < 5; band++) {
      const t = (band + .15) / 5, b = (band + .55) / 5, w = g.size * .023;
      add([bandPoint(t, -w), bandPoint(t, w), bandPoint(b, w), bandPoint(b, -w)], [149, 166, 173], false, false, false);
    }
  }
  for (const port of PORTS) for (const side of [1, -1]) {
    const cx = (port.x - .5) * g.size, cy = (port.y - .5) * g.carHeight, z = side * (depth + 1);
    const points = [{ x: cx - g.size * .015, y: cy - 1, z }, { x: cx + g.size * .015, y: cy - 1, z },
      { x: cx + g.size * .015, y: cy + 1, z }, { x: cx - g.size * .015, y: cy + 1, z }];
    if (side < 0) points.reverse();
    add(points, [41, 58, 65]);
  }
  faces.sort((a, b) => a.depth - b.depth);
  return faces;
}

function textureTriangle(ctx, image, points, uv) {
  const [a, b, c] = points, [s, t, u] = uv.map(([x, y]) => [x * image.naturalWidth, y * image.naturalHeight]);
  const det = s[0] * (t[1] - u[1]) + t[0] * (u[1] - s[1]) + u[0] * (s[1] - t[1]);
  if (Math.abs(det) < 1e-8) return;
  const coeff = key => [
    (a[key] * (t[1] - u[1]) + b[key] * (u[1] - s[1]) + c[key] * (s[1] - t[1])) / det,
    (a[key] * (u[0] - t[0]) + b[key] * (s[0] - u[0]) + c[key] * (t[0] - s[0])) / det,
    (a[key] * (t[0] * u[1] - u[0] * t[1]) + b[key] * (u[0] * s[1] - s[0] * u[1]) + c[key] * (s[0] * t[1] - t[0] * s[1])) / det,
  ];
  const x = coeff('x'), y = coeff('y');
  ctx.save();ctx.beginPath();ctx.moveTo(a.x, a.y);ctx.lineTo(b.x, b.y);ctx.lineTo(c.x, c.y);ctx.closePath();ctx.clip();
  ctx.transform(x[0], y[0], x[1], y[1], x[2], y[2]);ctx.drawImage(image, 0, 0);ctx.restore();
}

export function drawCarMesh(ctx, image, g, pose, suspension = {}, wheelAngle = 0, padding = MESH_PADDING) {
  ctx.clearRect(0, 0, g.size + padding * 2, g.carHeight + padding * 2);
  if (!image?.naturalWidth) return false;
  ctx.save();ctx.translate(padding, padding);
  const faces = meshFaces(g, pose, suspension, wheelAngle);
  for (const face of faces) {
    const p = face.points;
    if (face.texture && Math.abs(Math.sin((pose.roll || 0) * Math.PI / 180)) < 1e-7) {
      // One image draw avoids triangle seams and exactly preserves the first asset.
      const corner = (u,v) => p[face.uv.findIndex(q=>q[0]===u&&q[1]===v)];
      const a = corner(0,0), b = corner(1,0), d = corner(0,1);
      ctx.save();ctx.transform((b.x-a.x)/image.naturalWidth,(b.y-a.y)/image.naturalWidth,
        (d.x-a.x)/image.naturalHeight,(d.y-a.y)/image.naturalHeight,a.x,a.y);
      ctx.drawImage(image,0,0);ctx.restore();
    } else if (face.texture) {
      textureTriangle(ctx, image, [p[0], p[1], p[2]], [face.uv[0], face.uv[1], face.uv[2]]);
      textureTriangle(ctx, image, [p[0], p[2], p[3]], [face.uv[0], face.uv[2], face.uv[3]]);
    } else {
      ctx.beginPath();ctx.moveTo(p[0].x, p[0].y);for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.closePath();ctx.fillStyle = face.color;ctx.fill();
      ctx.strokeStyle = face.color;ctx.lineWidth = .45;ctx.stroke();
    }
  }
  ctx.restore();return true;
}
