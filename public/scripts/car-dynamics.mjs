import { clamp, mod, contain as legacyContain } from './car-motion.mjs';
import { geometry, trackPose, roadPath } from './car-route.mjs?v=20261017-14';
import { balanceJets } from './car-ride.mjs?v=20261017-14';
export { geometry, trackPose, roadPath };
export { clamp, mod } from './car-motion.mjs';
export function contain(g,pose) {
  const extra=(g.edgeInset||12)-12;
  return legacyContain({...g,left:g.left-extra,right:g.right+extra,top:g.top-extra,bottom:g.bottom+extra},pose);
}
export { spring } from './car-physics.mjs';

export const GRAVITY = 9.81;
export const VEHICLE_MASS = 2; // Relative to the previous vehicle; gravity stays 9.81 m/s².
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
  const a=pose.angle*Math.PI/180,n={x:Math.sin(a),y:-Math.cos(a)},forward=tangent(pose,1),b=flightBounds(g,pose);
  const room=(x,y)=>Math.max(0,Math.min(x<-.001?(pose.x-b.left)/-x:x>.001?(b.right-pose.x)/x:Infinity,
    y<-.001?(pose.y-b.top)/-y:y>.001?(b.bottom-pose.y)/y:Infinity));
  const gravity=GRAVITY*g.size/4.84;
  // A sizeable inward impulse, with an upward component on vertical walls.
  // Available stopping room limits the impulse, never a prescribed height curve.
  const lift={x:n.x*.8,y:n.y*.8-.65*(1-Math.abs(n.y))},length=Math.hypot(lift.x,lift.y);
  lift.x/=length;lift.y/=length;
  const hop=Math.sqrt(2*gravity*Math.max(0,Math.min(g.size*(kind==='kickflip'?.85:.9),room(lift.x,lift.y)*.46)));
  const travel=Math.min(speed*(kind==='ramp'?.7:.7),g.size*2,Math.sqrt(2*gravity*Math.max(0,room(forward.x,forward.y)-g.size*.25)));
  let x=forward.x*travel+lift.x*hop,y=forward.y*travel+lift.y*hop;
  if(y<0)y=Math.max(y,-Math.sqrt(2*gravity*Math.max(0,Math.min(g.size*1.15,room(0,-1)*.65))));
  return{x,y};
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
  const normal={x:Math.sin(a),y:-Math.cos(a)},inward=Math.max(0,vx*normal.x+vy*normal.y);
  const incoming=attachment?.incoming || {x:vx-normal.x*inward,y:vy-normal.y*inward};
  const burn=kind==='drop'?0:.14;
  const launchVX=burn?vx-incoming.x:0,launchVY=burn?vy-incoming.y:0;
  return { ...start, kind, scale, gravity, mass: VEHICLE_MASS, burn, launchVX, launchVY,
    vx: vx-launchVX, vy: vy-launchVY, originX: start.x, thrust: 0, frontThrust: 0, rearThrust: 0,
    launchNormal: { x: Math.sin(a), y: -Math.cos(a) }, landingAngle, turnDuration,
    localFlip: false, attachDistance: attachment?.distance, attachSpeed: Math.min(160, attachment?.speed || 0),
    jets: { left: 0, right: 0, up: 0, down: 0 }, avoiding: false, constraintError: 0,
    angle: initialAngle, initialAngle, angularVelocity: 0, elapsed: 0, roll: 0,
    targetX: clamp(start.x + vx * fallTime, g.left + g.radius, g.right - g.radius),
    phase: vy < 0 ? 'ascent' : 'fall', lit: false, landed: false };
}

// The actual rotated body envelope, including roll depth and safe-area offsets.
// Eight pixels are a hard visual clearance; the controller adds a soft buffer.
export function flightBounds(g, pose) {
  const angle = pose.angle * Math.PI / 180, roll = (pose.roll || 0) * Math.PI / 180;
  const hangingHeight=g.carHeight+Math.abs(pose.wheelOffset||0)*2;
  const height = Math.max(hangingHeight, Math.abs(Math.cos(roll)) * hangingHeight + Math.abs(Math.sin(roll)) * g.size * .35);
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

// Fixed 240 Hz force integration. Gravity is added on EVERY airborne substep,
// including takeoff, rotation, braking and the final unpowered touchdown.
export function stepFlight(g,state,seconds) {
  if(state.landed)return state;
  const f={...state},duration=clamp(seconds,0,.1),steps=Math.ceil(duration*240),dt=steps?duration/steps:0;
  for(let i=0;i<steps&&!f.landed;i++){
    const elapsed=f.elapsed;f.elapsed+=dt;const previousBounds=flightBounds(g,f);
    const u=clamp((f.elapsed-.08)/f.turnDuration,0,1),delta=f.landingAngle-f.initialAngle;
    const blend=u**3*(10-15*u+6*u*u),rate=delta*30*u*u*(1-u)**2/f.turnDuration;
    const feed=delta*60*u*(1-u)*(1-2*u)/f.turnDuration**2;
    const target=f.kind==='ramp'?f.initialAngle+delta*blend:0;
    const torque=clamp((target-f.angle)*34+((f.kind==='ramp'?rate:0)-f.angularVelocity)*11+(f.kind==='ramp'?feed:0),-1200,1200);
    f.angularVelocity+=torque*dt;f.angle+=f.angularVelocity*dt;
    const flipDuration=1.18,t=clamp(f.elapsed/flipDuration,0,1);
    f.roll=f.kind==='kickflip'?360*t**3*(10-15*t+6*t*t):0;
    const rollAcceleration=f.kind==='kickflip'?360*60*t*(1-t)*(1-2*t)/flipDuration**2:0;
    f.rollVelocity=f.kind==='kickflip'?360*30*t*t*(1-t)**2/flipDuration:0;
    f.rollPhase=f.kind!=='kickflip'||t>=1?'settled':t<.08?'ignition':t<.47?'spin-up':t<.53?'coast':'counter-burn';
    const b=flightBounds(g,f),floor=g.bottom-(f.wheelOffset||0),remaining=Math.max(0,floor-f.y);
    b.bottom=Math.min(b.bottom,floor);
    const burning=elapsed<(f.burn||0),burnPart=burning?Math.min(dt,f.burn-elapsed)/dt:0;
    const launchX=burnPart*f.launchVX/f.burn||0,launchY=burnPart*f.launchVY/f.burn||0;
    const stopping=Math.max(0,f.vy)**2/(2*f.gravity*3.2);
    if(!burning&&f.vy>=0&&remaining<=stopping+g.size*.46)f.lit=true;
    const ready=f.elapsed>(f.kind==='kickflip'?flipDuration+.05:.55)&&Math.abs(f.targetX-f.x)<1.2
      &&Math.abs(f.vx)<8&&Math.abs(f.angle-f.landingAngle)<.8&&Math.abs(f.angularVelocity)<3;
    if(ready&&remaining<g.size*.012)f.finalDrop=true;
    // Settle the attitude in air, then close the valves for a short gravity drop.
    // This leaves a real, bounded contact impulse for the air suspension.
    const desiredVy=ready?Math.min(f.scale*.6+remaining*1.8,Math.sqrt(2*f.gravity*Math.max(0,remaining-g.size*.012)+(f.scale*.6)**2)):0;
    const braking=f.lit&&!f.finalDrop?clamp(f.gravity+10*(f.vy-desiredVy),0,f.gravity*5):0;
    const steer=f.lit?clamp((f.targetX-f.x)*26-f.vx*10.2,-f.gravity*3,f.gravity*3):0;
    const rawX=launchX+steer,rawY=f.gravity+launchY-braking;
    const ax=avoidAxis(f.x,f.vx,b.left,b.right,(b.left-previousBounds.left)/dt,(b.right-previousBounds.right)/dt,rawX,f.gravity,dt);
    const ay=avoidAxis(f.y,f.vy,b.top,f.finalDrop?Infinity:b.bottom,(b.top-previousBounds.top)/dt,0,rawY,f.gravity,dt,ready?0:undefined);
    f.avoiding=Math.abs(ax-rawX)>.1||Math.abs(ay-rawY)>.1;
    f.accelerationX=ax;f.accelerationY=ay;f.forceX=f.mass*ax;f.forceY=f.mass*(ay-f.gravity);
    f.thrust=Math.max(0,f.gravity-ay);f.torqueAcceleration=torque;
    const inertia=(g.size*g.size+g.carHeight*g.carHeight)/12;
    f.torqueThrust=f.mass*Math.abs(torque)*Math.PI/180*inertia/(g.size*.31*f.gravity);
    f.rollThrust=f.mass*Math.abs(rollAcceleration)*Math.PI/180*(g.carHeight**2+(g.size*.35)**2)/12/(g.size*.35*f.gravity);
    f.rollAcceleration=rollAcceleration;
    const total=f.mass*Math.hypot(ax,ay-f.gravity)/f.gravity+2*(f.torqueThrust+f.rollThrust);
    Object.assign(f,balanceJets(g,f,torque,total,dt));
    f.jets={left:Math.max(0,f.forceX)/f.gravity,right:Math.max(0,-f.forceX)/f.gravity,
      up:Math.max(0,f.forceY)/f.gravity,down:Math.max(0,-f.forceY)/f.gravity};
    const nextY=f.y+f.vy*dt+ay*dt*dt/2;
    if(f.finalDrop&&nextY>=floor){
      const gap=Math.max(0,floor-f.y),contact=ay?(-f.vy+Math.sqrt(Math.max(0,f.vy*f.vy+2*ay*gap)))/ay:gap/Math.max(.001,f.vy);
      const hit=clamp(contact,0,dt);f.x+=f.vx*hit+ax*hit*hit/2;f.vx+=ax*hit;
      f.impactSpeed=Math.abs(f.vy+ay*hit)/f.scale;f.touchdownAngle=mod(f.angle+180,360)-180;f.touchdownAngularVelocity=f.angularVelocity;
      Object.assign(f,{y:floor,vy:0,angle:0,angularVelocity:0,roll:0,thrust:0,frontThrust:0,rearThrust:0,
        torqueThrust:0,rollThrust:0,jets:{left:0,right:0,up:0,down:0},phase:'attached',landed:true});
      continue;
    }
    f.x+=f.vx*dt+ax*dt*dt/2;f.y=nextY;f.vx+=ax*dt;f.vy+=ay*dt;
    const x=clamp(f.x,b.left,b.right),y=clamp(f.y,b.top,b.bottom);
    f.constraintError=Math.max(f.constraintError||0,Math.abs(x-f.x),Math.abs(y-f.y));f.x=x;f.y=y;
    f.phase=f.finalDrop?'touchdown':f.lit?'braking':f.vy<0?'ascent':'fall';
  }
  return f;
}

export function bottomDistance(g, x) { return clamp(g.right - g.radius - x, 0, g.lengths[0]); }

export function resizeFlight(g, previous, flight) {
  const ratio = g.size / previous.size;
  const x = g.left + (flight.x - previous.left) * (g.right - g.left) / Math.max(1, previous.right - previous.left);
  const y = g.top + (flight.y - previous.top) * (g.bottom - g.top) / Math.max(1, previous.bottom - previous.top);
  return { ...flight, ...contain(g, { ...flight, x, y }), scale: g.size / 4.84, gravity: GRAVITY * g.size / 4.84,
    launchVX: flight.launchVX * ratio, launchVY: flight.launchVY * ratio,
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
