import { clamp } from './car-motion.mjs';
import { PORTS } from './car-thrusters.mjs?v=20261017-12';
import { spring } from './car-physics.mjs';

// A front-heavy approximation, not a measured vehicle-specific mass model.
export const MASS = Object.freeze({ frontAxle: .207, rearAxle: .774, center: .45 });
export const FRONT_LOAD = (MASS.rearAxle - MASS.center) / (MASS.rearAxle - MASS.frontAxle);
export const HEIGHTS = Object.freeze({ low: .045, ride: 0, high: -.06 });
export const AIR_EXTENSION = -.085;

export function suspensionStep(state,target,seconds,ride,landingElapsed=null,size=Infinity) {
  // Twice the sprung mass, with an underdamped contact phase. Two visible
  // compression/rebound cycles decay rather than being erased on touchdown.
  const recovery=landingElapsed===null?1:clamp((landingElapsed-1.5)/.8,0,1);
  const result=spring(state,target,seconds,{stiffness:ride.stiffness/(3-recovery),
    damping:ride.damping*(.28+.42*recovery)});
  const value=clamp(result.value,-size*.10,size*.070);
  return {value,velocity:value===result.value?result.velocity:0};
}

export function blendRide(from,to,t) {
  const u=clamp(t,0,1),ease=u*u*(3-2*u),result={...to};
  for(const key of ['speed','acceleration','stiffness','damping','bump','track','mud'])result[key]=from[key]+(to[key]-from[key])*ease;
  return result;
}

function noise(t,seed) {
  const hash=n=>{const v=Math.sin(n*127.1+seed*311.7)*43758.5453;return(v-Math.floor(v))*2-1};
  const n=Math.floor(t),u=t-n,s=u*u*(3-2*u);return hash(n)*(1-s)+hash(n+1)*s;
}

export function balanceJets(g,f,angularAcceleration,total,dt) {
  const upper=Math.cos((f.angle||0)*Math.PI/180)*Math.cos((f.roll||0)*Math.PI/180)<-.15;
  const frontPort=PORTS.find(p=>p.id===(upper?'roof':'lift-front')),rearPort=PORTS.find(p=>p.id===(upper?'roof-rear':'lift-rear'));
  const feedForward=(rearPort.x-MASS.center)/(rearPort.x-frontPort.x),wheelbase=(rearPort.x-frontPort.x)*g.size;
  const inertia=(g.size*g.size+g.carHeight*g.carHeight)/12;
  const torqueShare=inertia*(angularAcceleration*Math.PI/180)/(wheelbase*f.gravity);
  const seed=(f.initialAngle||0)*.013+(f.originX||f.x)/g.size;
  // Independent valve cadence, driven by attitude/rate/descent demand. It
  // redistributes lift rather than injecting random net force into the body.
  const cadence=9+Math.min(12,Math.abs(f.vy)/g.size*3+Math.abs(f.angularVelocity)/45);
  const valve=noise(f.elapsed*cadence,seed)*.055+noise(f.elapsed*(cadence*.73),seed+4)*.035;
  const command=clamp(feedForward+torqueShare/Math.max(.25,total)+valve,.07,.97);
  const previous=f.liftSplit??feedForward,rate=command>previous?31:22;
  const split=previous+(command-previous)*(1-Math.exp(-rate*dt));
  return {frontThrust:total*split,rearThrust:total*(1-split),liftSplit:split};
}

export function landingResponse(g,flight,ride) {
  const impact=clamp(flight.impactSpeed||0,0,1.8),angle=flight.touchdownAngle||0;
  const compliance=Math.sqrt(380/ride.stiffness);
  const energy=g.size*clamp(impact*.72*Math.sqrt(flight.mass||2)+Math.abs(flight.touchdownAngularVelocity||0)*.0015,0,1.8)*compliance;
  const frontFirst=angle<=0,delay=.04+Math.min(.045,Math.abs(angle)*.012);
  return {front:energy*FRONT_LOAD*1.8,rear:energy*(1-FRONT_LOAD)*1.8,
    frontDelay:frontFirst?0:delay,rearDelay:frontFirst?delay:0};
}
