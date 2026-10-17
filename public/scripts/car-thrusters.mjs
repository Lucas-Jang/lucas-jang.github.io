import { BODY_DEPTH, VIEW_YAW, projectWorldPoint } from './car-projection.mjs?v=20261017-14';

// Flush bumper, rocker, roof-rack and lateral trim valves. Side vents supply
// lift/wall clearance at 90°/270° roll, when roof/rocker normals point in depth.
export const PORTS = Object.freeze([
  { id: 'fore', x: .035, y: .67, nx: -1, ny: 0 },
  { id: 'aft', x: .963, y: .65, nx: 1, ny: 0 },
  { id: 'lift-front', x: .34, y: .735, nx: 0, ny: 1, axle: 'front' },
  { id: 'lift-rear', x: .65, y: .735, nx: 0, ny: 1, axle: 'rear' },
  { id: 'roof', x: .40, y: .19, nx: 0, ny: -1, axle: 'front' },
  { id: 'roof-rear', x: .78, y: .115, nx: 0, ny: -1, axle: 'rear' },
  { id: 'side-front', x: .34, y: .56, nx: 0, ny: 0, nz: 1, axle: 'front' },
  { id: 'side-rear', x: .65, y: .56, nx: 0, ny: 0, nz: 1, axle: 'rear' },
]);

export function projectPort(g, pose, suspension, port, side = 1) {
  return projectWorldPoint(g, pose, suspension, { x: (port.x - .5) * g.size,
    y: (port.y - .5) * g.carHeight, z: side * (g.size * BODY_DEPTH / 2 + 1) });
}

// Match the mesh rotation order. Preserve depth: an edge-on roll produces
// foreshortened exhaust, rather than a fictitious vertical stream.
export function jetVector(pose, suspension, v) {
  const pitch=(suspension.pitch||0)*Math.PI/180,roll=(pose.roll||0)*Math.PI/180;
  const yaw=Math.sin(roll)*VIEW_YAW*Math.PI/180,a=pose.angle*Math.PI/180;
  const px=Math.cos(pitch)*v.x-Math.sin(pitch)*v.y,py=Math.sin(pitch)*v.x+Math.cos(pitch)*v.y;
  const x=Math.cos(yaw)*px+Math.sin(yaw)*(v.z||0),z=-Math.sin(yaw)*px+Math.cos(yaw)*(v.z||0);
  const y=Math.cos(roll)*py-Math.sin(roll)*z,depth=Math.sin(roll)*py+Math.cos(roll)*z;
  return{x:Math.cos(a)*x-Math.sin(a)*y,y:Math.sin(a)*x+Math.cos(a)*y,z:depth};
}

export function thrusterCommands(g, pose, suspension, flight, boost = 0) {
  const roll=(pose.roll||0)*Math.PI/180,heading=pose.angle*Math.PI/180;
  const nodes=PORTS.flatMap(port=>[1,-1].map(side=>({port,side,key:`${port.id}:${side}`,
    normal:jetVector(pose,suspension,{x:port.nx,y:port.ny,z:(port.nz||0)*side}),
    force:{x:0,y:0,z:0},sources:new Set()})));
  const add=(node,v,power,source)=>{
    if(power<=0)return;node.force.x+=v.x*power;node.force.y+=v.y*power;node.force.z+=(v.z||0)*power;node.sources.add(source);
  };
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*(b.z||0);
  const position=node=>jetVector(pose,suspension,{x:(node.port.x-.5)*g.size,y:(node.port.y-.5)*g.carHeight,z:node.side*(g.size*BODY_DEPTH/2+1)});
  const average=selected=>selected.map(position).reduce((s,p)=>({x:s.x+p.x/selected.length,y:s.y+p.y/selected.length,z:s.z+p.z/selected.length}),{x:0,y:0,z:0});
  const choose=(direction,axle=null)=>{
    const candidates=nodes.filter(n=>!axle||n.port.axle===axle).map(node=>({node,score:dot(node.normal,direction)}));
    const best=Math.max(...candidates.map(c=>c.score));
    return candidates.filter(c=>c.score>=best-.025).map(c=>c.node);
  };
  const sum=(flight?.frontThrust||0)+(flight?.rearThrust||0),frontShare=sum?flight.frontThrust/sum:.5;
  function distribute(direction,power,source){
    if(power<=0)return;
    const selected=choose(direction),hasBoth=selected.some(n=>n.port.axle==='front')&&selected.some(n=>n.port.axle==='rear');
    const weight=n=>(n.port.nz?1:Math.max(0,(1+n.side*Math.cos(roll))/2))*(hasBoth?(n.port.axle==='front'?frontShare:1-frontShare):1);
    const total=selected.reduce((s,n)=>s+weight(n),0);
    for(const node of selected)add(node,direction,power*(total?weight(node)/total:1/selected.length),source);
  }
  for(const [key,x,y]of[['left',-1,0],['right',1,0],['up',0,-1],['down',0,1]])distribute({x,y,z:0},flight?.jets?.[key]||0,'translation');
  if(boost>0)distribute({x:Math.cos(heading),y:Math.sin(heading),z:0},boost*2,'boost');

  // Heading control: equal opposing forces, front down/rear up for positive
  // torque. These vectors stay in the screen plane during an inverted ramp.
  const turn=Math.sign(flight?.torqueAcceleration||0),pitchPower=flight?.torqueThrust||0;
  if(turn&&pitchPower>0){
    const direction={x:-Math.sin(heading)*turn,y:Math.cos(heading)*turn,z:0};
    const opposite={x:-direction.x,y:-direction.y,z:0};
    const front=choose(direction,'front'),rear=choose(opposite,'rear'),a=average(front),b=average(rear);
    const lever=Math.abs((b.x-a.x)*direction.y-(b.y-a.y)*direction.x);
    const force=pitchPower*g.size*.31/Math.max(g.size*.1,lever);
    for(const [selected,v]of[[front,direction],[rear,opposite]]){
      for(const node of selected)add(node,v,force/selected.length,'pitch');
    }
  }
  // Roll acceleration then counter-burn: diagonal near/far roof/rocker pairs.
  // Each pair has equal opposite 3D forces. Rotation adds zero hidden lift;
  // the brief zero-torque midpoint is ballistic coast, with gravity active.
  const spin=Math.sign(flight?.rollAcceleration||0),rollPower=flight?.rollThrust||0;
  if(spin&&rollPower>0){
    for(const [axle,share]of[['front',.57],['rear',.43]]){
      const pair=[1,-1].map(side=>nodes.find(n=>n.port.axle===axle&&n.port.ny===spin*side&&n.side===side));
      const a=position(pair[0]),b=position(pair[1]),v=jetVector(pose,suspension,{x:0,y:spin,z:0});
      const rx=b.x-a.x,ry=b.y-a.y,rz=b.z-a.z;
      const lever=Math.abs((ry*v.z-rz*v.y)*Math.cos(heading)+(rz*v.x-rx*v.z)*Math.sin(heading));
      const force=rollPower*g.size*BODY_DEPTH*share/Math.max(g.size*.1,lever);
      add(pair[0],v,force,'roll');add(pair[1],{x:-v.x,y:-v.y,z:-v.z},force,'roll');
    }
  }
  // Mix all controllers once per physical valve. One key and one resultant
  // plume prevent contradictory streams and emission-credit collisions.
  return nodes.flatMap(node=>{
    const {x,y,z}=node.force,power=Math.hypot(x,y,z);
    if(power<1e-7)return[];
    return[{key:node.key,port:node.port.id,side:node.side,...projectPort(g,pose,suspension,node.port,node.side),
      dx:x/power,dy:y/power,dz:z/power,power,sources:[...node.sources]}];
  });
}
