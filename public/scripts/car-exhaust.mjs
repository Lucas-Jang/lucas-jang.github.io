// Input is actual jet force relative to the former vehicle's weight. Mass and
// correction acceleration therefore increase exhaust together, without changing g.
export const EXHAUST_PADDING = 128;
export function plumeProfile(force,size) {
  const power=Math.max(0,force),root=Math.sqrt(power);
  return {rate:90*power**.82,speed:95+75*root,radius:size*(.025+.032*root),
    growth:size*(.22+.10*root),life:1.05+Math.min(.60,root*.15),opacity:Math.min(.94,.68+root*.08)};
}
export function exhaustSurface(width,height,dpr=1) {
  const w=width+EXHAUST_PADDING*2,h=height+EXHAUST_PADDING*2;
  return {width:w,height:h,dpr:Math.min(dpr,2,Math.sqrt(4000000/(w*h))),padding:EXHAUST_PADDING};
}
