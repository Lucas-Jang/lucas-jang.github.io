import { clamp, mod, contain as legacyContain } from './car-motion.mjs';
import { geometry, trackPose, roadPath } from './car-route.mjs?v=20261017-11';
import { balanceJets } from './car-ride.mjs?v=20261017-11';
export { geometry, trackPose, roadPath };
export { clamp, mod } from './car-motion.mjs';
export function contain(g,pose) {
  const extra=(g.edgeInset||12)-12;
  return legacyContain({...g,left:g.left-extra,right:g.right+extra,top:g.top-extra,bottom:g.bottom+extra},pose);
}
export { spring } from './car-physics.mjs';

export const GRAVITY = 9.81;
export const ENVIRONMENTS = Object.freeze({
  normal: { label: '노말', speed: 100, acceleration: 115, height: 'ride', stiffness: 380, damping: 28, bump: 0, color: '#a4bac4', track: 2, dash: '', mud: 0 },
  sport: { label: '스포츠', speed: 155, acceleration: 180, height: 'low', stiffness: 720, damping: 39, bump: .12, color: '#67cee8', track: 3, dash: '64 12', mud: 0 },
  offroad: { label: '오프로드', speed: 78, acceleration: 85, height: 'high', stiffness: 220, damping: 19, bump: 3.4, color: '#b7a279', track: 8, dash: '1 13', mud: 0 },
  mud: { label: '머드', speed: 58, acceleration: 60, height: 'high', stiffness: 300, damping: 31, bump: 2.5, color: '#91683f', track: 12, dash: '', mud: 1 },
});

export function tangent(pose, speed) {
  const a = pose.angle * Math.PI / 180;
  return { x: -Math.cos(a) * speed, y: -Math.sin(a) * speed };
}

export function stuntVelocity(g, pose, speed, kind = 'ramp') {
  const direction = tangent(pose, 1), angle = pose.angle * Math.PI / 180;
  const nx = Math.sin(angle), ny = -Math.cos(angle), bounds = flightBounds(g, pose);
  const rayRoom = (x, y) => Math.max(0, Math.min(
    x < -.001 ? (pose.x - bounds.left) / -x : x > .001 ? (bounds.right - pose.x) / x : Infinity,
    y < -.001 ? (pose.y - bounds.top) / -y : y > .001 ? (bounds.bottom - pose.y) / y : Infinity));
  const room = rayRoom(direction.x, direction.y);
  const gravity = GRAVITY * g.size / 4.84;
  const forward = Math.min(speed * (kind === 'ramp' ? .7 : .25), kind === 'kickflip' ? g.size * .65 : Infinity,
    Math.sqrt(2 * gravity * Math.max(g.size * .08, room - g.size * .25)));
  const inwardRoom = rayRoom(nx, ny);
  const hop = Math.sqrt(2 * gravity * Math.max(g.size * .08, Math.min(g.size * (kind === 'kickflip' ? .24 : .72), inwardRoom * .32)));
  return { x: direction.x * forward + nx * hop, y: direction.y * forward + ny * hop };
}

// Lower peak (70 km/h world scale), also bounded by the visible circuit size.
export function boostSpeed(g) { return Math.min(70 / 3.6 * g.size / 4.84, g.perimeter / 4.2); }
export function cruiseSpeed(g,ride=ENVIRONMENTS.normal) { return ride.speed*Math.min(1,boostSpeed(g)/(ENVIRONMENTS.sport.speed*1.6)); }
export function stepDrive(g, state, seconds, environment = ENVIRONMENTS.normal, boosted = false) {
  const dt = clamp(seconds, 0, .1);
  const power = boosted === true ? 1 : clamp(Number(boosted) || 0, 0, 1);
  const cruise=cruiseSpeed(g,environment);
  const desired = power ? cruise + (boostSpeed(g) - cruise) * power : cruise;
  const acceleration = power ? boostSpeed(g) * (.45 + .55 * power) : environment.acceleration;
  const next = state.speed + clamp(desired - state.speed, -environment.acceleration * dt, acceleration * dt);
  const travel = (state.speed + next) * .5 * dt;
  return { speed: next, acceleration: dt ? (next - state.speed) / dt : 0, travel,
    distance: mod(state.distance + travel, g.perimeter) };
}

export function stepBoostDrive(g,state,profile,seconds,ride=ENVIRONMENTS.normal) {
  const budget=g.perimeter*profile.lapRatio,spent=state.boostTravel||0,remaining=Math.max(0,budget-spent);
  const power=profile.power*clamp(remaining/(g.size*2.4),.04,1),next=stepDrive(g,state,seconds,ride,power);
  if(next.travel<remaining)return{...next,boostTravel:spent+next.travel,boostOutput:power,complete:false};
  const fraction=next.travel?remaining/next.travel:0,split={distance:mod(state.distance+remaining,g.perimeter),speed:state.speed+(next.speed-state.speed)*fraction};
  const coast=stepDrive(g,split,seconds*(1-fraction),ride,false);
  return{...coast,travel:remaining+coast.travel,acceleration:seconds?(coast.speed-state.speed)/seconds:0,boostTravel:budget,boostOutput:0,complete:true};
}

// The next entry into a rounded wall corner, including perimeter wraparound.
export function cornerCrossed(g, distance, travel) {
  return cornerCrossing(g, distance, travel) !== null;
}

export function cornerCrossing(g, distance, travel) {
  let end = 0;
  let crossing = null;
  for (let i = 0; i < 8; i++) {
    end += g.lengths[i];
    const offset = mod(end - distance - .000001, g.perimeter) + .000001;
    if (i % 2 === 0 && offset <= travel && (!crossing || offset < crossing.offset)) crossing = { offset, distance: mod(end, g.perimeter) };
  }
  return crossing;
}

export function createFlight(g, pose, kind = 'drop', velocity = {}, attachment = null) {
  const scale = g.size / 4.84, gravity = GRAVITY * scale;
  const start = contain(g, pose);
  const automatic = kind === 'drop' ? { x: 0, y: 0 } : stuntVelocity(g, start, 0, kind);
  const vx = clamp(velocity.x ?? automatic.x, -g.size * 8, g.size * 8);
  const vy = clamp(velocity.y ?? automatic.y, -g.size * 6, g.size * 8);
  const fallTime = (-vy + Math.sqrt(vy * vy + 2 * gravity * Math.max(0, g.bottom - start.y))) / gravity;
  const rampAngle = mod(start.angle, 360), initialAngle = kind === 'ramp' ? rampAngle : mod(start.angle + 180, 360) - 180;
  // Follow the increasing heading of the circuit through the next upright
  // revolution. An inverted departure must not suddenly reverse its rotation.
  const landingAngle = kind === 'ramp' && rampAngle > 60 ? 360 : 0;
  const turnDuration = .85 + Math.abs(landingAngle - initialAngle) / 250;
  const a = start.angle * Math.PI / 180;
  return { ...start, kind, scale, gravity, vx, vy, originX: start.x, thrust: 0, frontThrust: 0, rearThrust: 0,
    launchNormal: { x: Math.sin(a), y: -Math.cos(a) }, landingAngle, turnDuration,
    localFlip: kind === 'kickflip' && !!attachment, attachDistance: attachment?.distance, attachSpeed: Math.min(160, attachment?.speed || 0),
    jets: { left: 0, right: 0, up: 0, down: 0 }, avoiding: false, constraintError: 0,
    angle: initialAngle, initialAngle, angularVelocity: 0, elapsed: 0, roll: 0,
    targetX: clamp(start.x + vx * fallTime, g.left + g.radius, g.right - g.radius),
    phase: vy < 0 ? 'ascent' : 'fall', lit: false, landed: false };
}

// The actual rotated body envelope, including roll depth and safe-area offsets.
// Eight pixels are a hard visual clearance; the controller adds a soft buffer.
export function flightBounds(g, pose) {
  const angle = pose.angle * Math.PI / 180, roll = (pose.roll || 0) * Math.PI / 180;
  const height = Math.max(g.carHeight, Math.abs(Math.cos(roll)) * g.carHeight + Math.abs(Math.sin(roll)) * g.size * .35);
  const halfX = (Math.abs(Math.cos(angle)) * g.size + Math.abs(Math.sin(angle)) * height) / 2 + 8;
  const halfY = (Math.abs(Math.sin(angle)) * g.size + Math.abs(Math.cos(angle)) * height) / 2 + 8;
  const edge=g.edgeInset||12;
  const left = g.left - g.carHeight / 2 - edge + halfX;
  const right = g.right + g.carHeight / 2 + edge - halfX;
  const top = g.top - g.carHeight / 2 - edge + halfY;
  const bottom = Math.min(g.bottom, g.bottom + g.carHeight / 2 + edge - halfY);
  return { left, right, top, bottom };
}

// Stop-distance feed-forward before each wall. The final inequality constrains
// the integrated position, rather than bouncing a body after it hit the wall.
function avoidAxis(position, velocity, low, high, lowRate, highRate, base, gravity, dt, upperBuffer, lowerBuffer) {
  const buffer = clamp((high - low) * .035, 4, 14), braking = gravity * 6;
  const highBuffer = upperBuffer ?? buffer;
  const lowBuffer = lowerBuffer ?? buffer;
  const lowRoom = Math.max(0, position - low), highRoom = Math.max(0, high - position);
  const towardLow = Math.max(0, lowRate - velocity), towardHigh = Math.max(0, velocity - highRate);
  let acceleration = base;
  if (lowRoom < lowBuffer + towardLow ** 2 / (2 * braking)) {
    const limit = Math.sqrt(2 * braking * Math.max(0, lowRoom - lowBuffer));
    acceleration = Math.max(acceleration, (towardLow - limit) * 20 + Math.max(0, lowBuffer - lowRoom) * 36);
  }
  if (highRoom < highBuffer + towardHigh ** 2 / (2 * braking)) {
    const limit = Math.sqrt(2 * braking * Math.max(0, highRoom - highBuffer));
    acceleration = Math.min(acceleration, -(towardHigh - limit) * 20 - Math.max(0, highBuffer - highRoom) * 36);
  }
  const minimum = 2 * (low - position - velocity * dt) / (dt * dt);
  const maximum = 2 * (high - position - velocity * dt) / (dt * dt);
  return clamp(acceleration, minimum, maximum);
}

// Fixed 240 Hz integration: ballistic motion until stopping distance demands
// wall-avoidance or landing thrust; no post-contact elastic rebound.
export function stepFlight(g, state, seconds) {
  if (state.landed) return state;
  if (state.localFlip) return stepLocalFlip(g, state, seconds);
  const f = { ...state }, duration = clamp(seconds, 0, .1);
  const steps = Math.ceil(duration * 240), dt = steps ? duration / steps : 0;
  for (let i = 0; i < steps && !f.landed; i++) {
    f.elapsed += dt;
    const previousBounds = flightBounds(g, f);
    const progress = clamp((f.elapsed - .12) / .8, 0, 1), eased = progress * progress * (3 - 2 * progress);
    const loft = Math.sin(Math.PI * clamp(f.elapsed / .95, 0, 1)) * 8;
    const u = clamp((f.elapsed - .08) / f.turnDuration, 0, 1), delta = f.landingAngle - f.initialAngle;
    const blend = u ** 3 * (10 - 15 * u + 6 * u * u);
    const rate = delta * 30 * u * u * (1 - u) ** 2 / f.turnDuration;
    const feed = delta * 60 * u * (1 - u) * (1 - 2 * u) / f.turnDuration ** 2;
    const targetAngle = f.kind === 'ramp' ? f.initialAngle + delta * blend
      : f.kind === 'drop' ? 0 : (f.initialAngle ?? 0) * (1 - eased) + loft;
    const torque = clamp((targetAngle - f.angle) * 42 + ((f.kind === 'ramp' ? rate : 0) - f.angularVelocity) * 12 + (f.kind === 'ramp' ? feed : 0), -1700, 1700);
    f.angularVelocity += torque * dt; f.angle += f.angularVelocity * dt;
    const t = clamp(f.elapsed / .96, 0, 1);
    f.roll = f.kind === 'kickflip' ? 360 * (t * t * (3 - 2 * t)) : 0;
    const bounds = flightBounds(g, f);
    const remaining = Math.max(0, Math.min(g.bottom, bounds.bottom) - f.y);
    const stopping = Math.max(0, f.vy) ** 2 / (2 * f.gravity * 3.5);
    if (f.vy >= 0 && remaining <= stopping + g.size * .22) f.lit = true;
    const ready = f.elapsed > (f.kind === 'kickflip' ? 1.05 : .55)
      && Math.abs(f.targetX - f.x) < .6 && Math.abs(f.vx) < 8 && Math.abs(f.angle - f.landingAngle) < 3 && Math.abs(f.angularVelocity) < 12;
    const desiredVy = ready ? Math.min(f.scale * .42 + remaining * 3, Math.sqrt(2 * f.gravity * 1.7 * remaining)) : 0;
    f.thrust = f.lit ? clamp(f.gravity + 11 * (f.vy - desiredVy), 0, f.gravity * 5) : 0;
    const steer = f.lit ? clamp((f.targetX - f.x) * 32 - f.vx * 11.3, -f.gravity * 3, f.gravity * 3) : 0;
    const vertical = f.gravity - f.thrust;
    const ax = avoidAxis(f.x, f.vx, bounds.left, bounds.right,
      (bounds.left - previousBounds.left) / dt, (bounds.right - previousBounds.right) / dt, steer, f.gravity, dt);
    const ay = avoidAxis(f.y, f.vy, bounds.top, bounds.bottom,
      (bounds.top - previousBounds.top) / dt, (bounds.bottom - previousBounds.bottom) / dt, vertical, f.gravity, dt, ready ? 0 : undefined);
    f.avoiding = Math.abs(ax - steer) > .1 || Math.abs(ay - vertical) > .1;
    f.thrust = Math.max(0, f.gravity - ay);
    f.x += f.vx * dt + ax * dt * dt / 2;
    f.y += f.vy * dt + ay * dt * dt / 2;
    f.vx += ax * dt; f.vy += ay * dt;

    // Exhaust points toward the approached wall; its reaction moves away.
    const impulse = f.kind !== 'drop' && f.elapsed < .16 ? 1 - f.elapsed / .16 : 0;
    const total = Math.max(f.thrust / f.gravity, impulse * 2.6);
    Object.assign(f, balanceJets(g, f, torque, total, dt));
    const n=f.launchNormal;
    f.jets = { left: Math.max(Math.max(0, ax) / f.gravity, Math.max(0,n?.x||0)*impulse*2.6),
      right: Math.max(Math.max(0, -ax) / f.gravity, Math.max(0,-(n?.x||0))*impulse*2.6),
      up: Math.max(Math.max(0, ay - f.gravity) / f.gravity,Math.max(0,n?.y||0)*impulse*2.6),
      down: Math.max(f.thrust/f.gravity,Math.max(0,-(n?.y||0))*impulse*2.6) };
    const x = clamp(f.x, bounds.left, bounds.right), y = clamp(f.y, bounds.top, bounds.bottom);
    f.constraintError = Math.max(f.constraintError || 0, Math.abs(x - f.x), Math.abs(y - f.y));
    f.x = x; f.y = y; // Floating-point roundoff only; no restitution/bounce.
    f.phase = f.lit ? 'braking' : f.vy < 0 ? 'ascent' : 'fall';
    if (ready && g.bottom - f.y < .06 && Math.abs(f.vy) < Math.min(24, f.scale * .65)) {
      f.impactSpeed = Math.abs(f.vy) / f.scale;
      f.touchdownAngle = mod(f.angle + 180,360)-180; f.touchdownAngularVelocity = f.angularVelocity;
      Object.assign(f, { y: g.bottom, angle: 0, angularVelocity: 0, roll: 0,
        thrust: 0, frontThrust: 0, rearThrust: 0, jets: { left: 0, right: 0, up: 0, down: 0 }, avoiding: false, phase: 'attached', landed: true });
    }
  }
  return f;
}

function stepLocalFlip(g,state,seconds) {
  const f={...state},duration=clamp(seconds,0,.1),steps=Math.ceil(duration*240),dt=steps?duration/steps:0;
  const target=t=>{
    const travel=flipTravel(t);
    const d=f.attachDistance+f.attachSpeed*travel,p=trackPose(g,d),u=clamp(t/1.4,0,1);
    const lift=g.size*.25*Math.sin(Math.PI*u)**2;
    return {...p,x:p.x+p.nx*lift,y:p.y+p.ny*lift,distance:mod(d,g.perimeter)};
  };
  for(let i=0;i<steps&&!f.landed;i++){
    f.elapsed+=dt;const previousBounds=flightBounds(g,f),p=target(f.elapsed),q=target(f.elapsed+dt),r=target(f.elapsed+2*dt);
    f.anchorDistance=p.distance;
    const vx=(q.x-p.x)/dt,vy=(q.y-p.y)/dt,assist=clamp((f.elapsed-.06)/.16,0,1);
    const difference=mod(p.angle-f.angle+180,360)-180;
    const rate=(mod(q.angle-p.angle+180,360)-180)/dt;
    const nextRate=(mod(r.angle-q.angle+180,360)-180)/dt;
    const torque=clamp(difference*65+(rate-f.angularVelocity)*16+clamp((nextRate-rate)/dt,-700,700),-1400,1400);
    f.angularVelocity+=torque*dt;f.angle+=f.angularVelocity*dt;
    const t=clamp(f.elapsed/.96,0,1);f.roll=360*t*t*(3-2*t);
    const bounds=flightBounds(g,f);
    const rawX=assist*(clamp((r.x-2*q.x+p.x)/dt**2,-f.gravity*3,f.gravity*3)+(p.x-f.x)*85+(vx-f.vx)*18);
    const rawY=f.gravity+assist*(-f.gravity+clamp((r.y-2*q.y+p.y)/dt**2,-f.gravity*3,f.gravity*3)+(p.y-f.y)*85+(vy-f.vy)*18);
    const contactBuffer=f.elapsed>1.1?0:undefined;
    const ax=avoidAxis(f.x,f.vx,bounds.left,bounds.right,(bounds.left-previousBounds.left)/dt,(bounds.right-previousBounds.right)/dt,rawX,f.gravity,dt,contactBuffer,contactBuffer);
    const ay=avoidAxis(f.y,f.vy,bounds.top,bounds.bottom,(bounds.top-previousBounds.top)/dt,(bounds.bottom-previousBounds.bottom)/dt,rawY,f.gravity,dt,contactBuffer,contactBuffer);
    f.x+=f.vx*dt+ax*dt*dt/2;f.y+=f.vy*dt+ay*dt*dt/2;f.vx+=ax*dt;f.vy+=ay*dt;
    const x=clamp(f.x,bounds.left,bounds.right),y=clamp(f.y,bounds.top,bounds.bottom);
    f.constraintError=Math.max(f.constraintError||0,Math.abs(x-f.x),Math.abs(y-f.y));f.x=x;f.y=y;
    f.thrust=Math.max(0,f.gravity-ay);f.lit=assist>0;
    f.jets={left:Math.max(0,ax)/f.gravity,right:Math.max(0,-ax)/f.gravity,up:Math.max(0,ay-f.gravity)/f.gravity,down:f.thrust/f.gravity};
    // The takeoff impulse already supplies the initial inward velocity. Render
    // its finite valve pulse from the very first ascent frame, away from the
    // departure surface, as well as the continuous controller's balancing jets.
    const pulse=2.6*Math.max(0,1-f.elapsed/.28)**2,n=f.launchNormal;
    if(n){f.jets.left=Math.max(f.jets.left,Math.max(0,n.x)*pulse);f.jets.right=Math.max(f.jets.right,Math.max(0,-n.x)*pulse);
      f.jets.up=Math.max(f.jets.up,Math.max(0,n.y)*pulse);f.jets.down=Math.max(f.jets.down,Math.max(0,-n.y)*pulse);}
    Object.assign(f,balanceJets(g,f,torque,Math.max(pulse,f.thrust/f.gravity,Math.hypot(ax,ay-f.gravity)/f.gravity*.55),dt));
    f.phase=f.elapsed<.7?'ascent':'braking';f.avoiding=Math.abs(ax-rawX)>.1||Math.abs(ay-rawY)>.1;
    const base=trackPose(g,p.distance),error=Math.hypot(f.x-base.x,f.y-base.y),relative=Math.hypot(f.vx-vx,f.vy-vy);
    if(f.elapsed>=1.4&&error<.55&&relative<8&&Math.abs(difference)<2){
      f.impactSpeed=relative/f.scale;f.touchdownAngle=difference;f.attachDistance=p.distance;f.landingSpeed=0;
      Object.assign(f,{x:base.x,y:base.y,angle:base.angle,roll:0,landed:true,phase:'attached',thrust:0,frontThrust:0,rearThrust:0,
        jets:{left:0,right:0,up:0,down:0}});
    }
  }
  return f;
}

function flipTravel(t) { const coast=clamp((t-.8)/.6,0,1);return t<.8?t:.8+.6*(coast-coast**3+.5*coast**4); }

function mapTrackDistance(previous,g,distance) {
  let d=mod(distance,previous.perimeter),segment=0,start=0;
  while(segment<7&&d>previous.lengths[segment]){d-=previous.lengths[segment];start+=g.lengths[segment++];}
  return mod(start+(previous.lengths[segment]?d/previous.lengths[segment]:0)*g.lengths[segment],g.perimeter);
}

export function bottomDistance(g, x) { return clamp(g.right - g.radius - x, 0, g.lengths[0]); }

export function resizeFlight(g, previous, flight) {
  const ratio = g.size / previous.size;
  if(flight.localFlip){
    const anchorDistance=flight.anchorDistance??flight.attachDistance+flight.attachSpeed*flipTravel(flight.elapsed);
    const old=trackPose(previous,anchorDistance),distance=mapTrackDistance(previous,g,anchorDistance),next=trackPose(g,distance);
    const dx=flight.x-old.x,dy=flight.y-old.y,normal=(dx*old.nx+dy*old.ny)*ratio,along=(-dx*old.ny+dy*old.nx)*ratio;
    const angleDelta=mod(next.angle-old.angle+180,360)-180,a=angleDelta*Math.PI/180;
    const f={...flight,x:next.x+next.nx*normal-next.ny*along,y:next.y+next.ny*normal+next.nx*along,
      angle:flight.angle+angleDelta,vx:(flight.vx*Math.cos(a)-flight.vy*Math.sin(a))*ratio,
      vy:(flight.vx*Math.sin(a)+flight.vy*Math.cos(a))*ratio,scale:g.size/4.84,gravity:GRAVITY*g.size/4.84,
      attachSpeed:flight.attachSpeed*ratio,attachDistance:mod(distance-flight.attachSpeed*ratio*flipTravel(flight.elapsed),g.perimeter),anchorDistance:distance};
    const b=flightBounds(g,f);f.x=clamp(f.x,b.left,b.right);f.y=clamp(f.y,b.top,b.bottom);return f;
  }
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
