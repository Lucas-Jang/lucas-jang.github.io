export const BODY_DEPTH = .35;
export const VIEW_YAW = 4;

// One camera/transform for the mesh, exhaust anchors and frame-by-frame QA.
export function projectPoint(g, pose, suspension, point, body = true) {
  const pitch = (body ? suspension.pitch || 0 : 0) * Math.PI / 180;
  const roll = (pose.roll || 0) * Math.PI / 180, yaw = Math.sin(roll) * VIEW_YAW * Math.PI / 180;
  const x = point.x, y = point.y - g.carHeight * .08;
  const px = Math.cos(pitch) * x - Math.sin(pitch) * y;
  const py = Math.sin(pitch) * x + Math.cos(pitch) * y + (body ? suspension.heave || 0 : 0) + (suspension.comShift || 0);
  const rx = Math.cos(yaw) * px + Math.sin(yaw) * point.z;
  const rz = -Math.sin(yaw) * px + Math.cos(yaw) * point.z;
  const ry = Math.cos(roll) * py - Math.sin(roll) * rz;
  const depth = Math.sin(roll) * py + Math.cos(roll) * rz;
  // The resting view is the original, undistorted side illustration. Perspective
  // grows continuously as the car rolls, then returns to an orthographic side.
  const perspective = Math.sin(roll) ** 2;
  const cameraY = g.carHeight * .08 + ry, scale = 700 / (700 - depth * perspective);
  return { x: g.size / 2 + rx * scale, y: g.carHeight / 2 + cameraY * scale, depth, cameraX: rx, cameraY, perspective };
}

export function projectWorldPoint(g, pose, suspension, point, body = true) {
  const p = projectPoint(g, pose, suspension, point, body), a = pose.angle * Math.PI / 180;
  const x = p.x - g.size / 2, y = p.y - g.carHeight / 2;
  return { x: pose.x + Math.cos(a) * x - Math.sin(a) * y, y: pose.y + Math.sin(a) * x + Math.cos(a) * y };
}
