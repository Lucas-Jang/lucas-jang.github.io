import { geometry as baseGeometry, clamp, mod } from './car-motion.mjs';

// Quintic corners have zero curvature at both straight joins. Arc-length
// lookup keeps linear speed constant while steering eases into/out of a turn.
const choose = [1,5,10,10,5,1];
function curve(t,points) {
  let x=0,y=0,dx=0,dy=0;
  for(let i=0;i<6;i++) { const b=choose[i]*(1-t)**(5-i)*t**i; x+=b*points[i][0]; y+=b*points[i][1]; }
  for(let i=0;i<5;i++) { const b=[1,4,6,4,1][i]*(1-t)**(4-i)*t**i*5; dx+=b*(points[i+1][0]-points[i][0]); dy+=b*(points[i+1][1]-points[i][1]); }
  return {x,y,dx,dy};
}
function atDistance(g,d) {
  const samples=g.cornerSamples;
  let lo=0,hi=samples.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m].d<d)lo=m;else hi=m;}
  const a=samples[lo],b=samples[hi];return curve(a.t+(b.t-a.t)*clamp((d-a.d)/(b.d-a.d),0,1),g.cornerPoints);
}

export function geometry(viewport,safe={}) {
  const base=baseGeometry(viewport,safe);
  const compact=viewport.compact ?? Math.min(viewport.width,viewport.height)<=600;
  const size=Math.min(viewport.carSize || Infinity,compact?Math.min(base.size,Math.max(96,base.size*.70)):base.size);
  const carHeight=size*.43,delta=(base.carHeight-carHeight)/2;
  const clearance=compact?8:12,minimumInset=compact?10:18;
  let edgeInset=minimumInset,g,radius,cornerPoints;
  // Calibrate the complete rotating body envelope once per viewport. The
  // drive loop never clamps a corner position and therefore cannot catch/jump.
  for(let iteration=0;iteration<12;iteration++){
    const extra=edgeInset-12;
    g={...base,size,carHeight,edgeInset,left:base.left-delta+extra,right:base.right+delta-extra,top:base.top-delta+extra,bottom:base.bottom+delta-extra};
    // Real top/bottom straights instead of a narrow, oval-shaped circuit.
    radius=Math.min(size*(compact?.9:1.7),(g.right-g.left)/2,(g.bottom-g.top)/2);
    const k=compact?clamp(radius/size*1.67,.5,1.5):clamp((radius/size-.63)*3.5+.5,.5,1.2);
    cornerPoints=[[1,1],[1-k/5,1],[1-2*k/5,1],[0,2*k/5],[0,k/5],[0,0]];
    let needed=minimumInset;
    for(let i=0;i<=128;i++){
      const p=curve(i/128,cornerPoints),length=Math.hypot(p.dx,p.dy),cs=Math.abs(p.dx)/length,sn=Math.abs(p.dy)/length;
      needed=Math.max(needed,(cs*size+sn*carHeight)/2+clearance-carHeight/2-radius*p.x,
        (sn*size+cs*carHeight)/2+clearance-carHeight/2-radius*(1-p.y));
    }
    if(needed<=edgeInset+.001)break;
    edgeInset=needed+.75;
  }
  const cornerSamples=[{t:0,d:0,...curve(0,cornerPoints)}];
  for(let i=1;i<=512;i++){const p=curve(i/512,cornerPoints),last=cornerSamples.at(-1);cornerSamples.push({t:i/512,d:last.d+Math.hypot(p.x-last.x,p.y-last.y),...p});}
  const arc=cornerSamples.at(-1).d;
  const h=Math.max(0,g.right-g.left-radius*2),v=Math.max(0,g.bottom-g.top-radius*2),a=radius*arc;
  return {...g,radius,cornerPoints,cornerSamples,cornerArc:arc,lengths:[h,a,v,a,h,a,v,a],perimeter:2*h+2*v+4*a};
}

export function trackPose(g,distance) {
  let d=mod(distance,g.perimeter||1),segment=0;
  while(segment<7&&d>g.lengths[segment])d-=g.lengths[segment++];
  const t=g.lengths[segment]?d/g.lengths[segment]:0,{left:l,right:r,top,bottom:b,radius:c}=g;
  let x,y,angle;
  if(segment===0){x=r-c-d;y=b;angle=0;}
  if(segment===2){x=l;y=b-c-d;angle=90;}
  if(segment===4){x=l+c+d;y=top;angle=180;}
  if(segment===6){x=r;y=top+c+d;angle=270;}
  if(segment%2){
    const corner=(segment-1)/2,p=atDistance(g,t*g.cornerArc),a=corner*Math.PI/2,cs=Math.cos(a),sn=Math.sin(a);
    const centers=[[l+c,b-c],[l+c,top+c],[r-c,top+c],[r-c,b-c]],px=(p.x-1)*c,py=p.y*c;
    x=centers[corner][0]+cs*px-sn*py;y=centers[corner][1]+sn*px+cs*py;
    angle=corner*90+Math.atan2(-p.dy,-p.dx)*180/Math.PI;
  }
  const a=angle*Math.PI/180;return{x,y,angle,nx:Math.sin(a),ny:-Math.cos(a)};
}

export function roadPath(g) {
  const offset=g.carHeight*.43,commands=[];let start=0;
  for(let segment=0;segment<8;segment++){
    const count=segment%2?64:1;
    for(let i=0;i<=count;i++){
      const p=trackPose(g,start+g.lengths[segment]*i/count);
      commands.push(`${commands.length?'L':'M'}${(p.x-p.nx*offset).toFixed(3)},${(p.y-p.ny*offset).toFixed(3)}`);
    }
    start+=g.lengths[segment];
  }
  return commands.join('')+'Z';
}
