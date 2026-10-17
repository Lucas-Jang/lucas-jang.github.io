// Actual jet force drives a bounded visual pressure. Mass and correction demand
// still increase exhaust; the visual envelope never changes physics or gravity.
export const EXHAUST_PADDING = 128;
export const exhaustVisibility = force => -Math.expm1(-Math.max(0,force)*4);
export const EXHAUST_LAYER_OPACITY = .66;
export const particleBudget = width => width<=600?168:240;
// Visual pressure only: physics still receives the complete requested force.
// Equal attack/release time constants preserve brightness during valve handoff.
export function stepExhaustEmitters(emitters,commands,seconds) {
  const targets=new Map(commands.map(c=>[c.key,c]));
  const blend=-Math.expm1(-Math.max(0,Math.min(.1,seconds))/.075);
  for(const command of commands)if(!emitters.has(command.key))emitters.set(command.key,{...command,power:0});
  for(const [key,previous]of emitters){
    const command=targets.get(key),demand=command?6*-Math.expm1(-Math.max(0,command.power)/6):0;
    const power=previous.power+(demand-previous.power)*blend;
    if(!command&&power<.001){emitters.delete(key);continue;}
    emitters.set(key,{...(command||previous),power});
  }
  return [...emitters.values()];
}
export function depthMistOpacity(depth) {
  const t=Math.max(0,Math.min(1,(Math.abs(depth)-.08)/.72));
  return t*t*(3-2*t)*.22;
}
export function particleOpacity(p,seconds,landing=false) {
  // Fade is stored on each particle: cancelling/restarting a landing must not
  // restore the opacity of mist that had already cleared.
  if(landing)p.opacity*=Math.exp(-Math.max(0,seconds)*8);
  const age=Math.max(0,Math.min(1,p.age/p.life));
  return Math.min(1,p.age/.045)*(1-age)**1.7*p.opacity;
}
export function plumeProfile(force,size) {
  const power=Math.max(0,force),root=Math.sqrt(power);
  return {rate:42*power**.7,speed:85+50*root,radius:size*(.018+.016*root),
    growth:size*(.13+.035*root),life:.55+Math.min(.32,root*.09),opacity:Math.min(.40,.24+root*.045)*exhaustVisibility(power)};
}
export function exhaustSurface(width,height,dpr=1) {
  const w=width+EXHAUST_PADDING*2,h=height+EXHAUST_PADDING*2;
  return {width:w,height:h,dpr:Math.min(dpr,2,Math.sqrt(4000000/(w*h))),padding:EXHAUST_PADDING};
}
