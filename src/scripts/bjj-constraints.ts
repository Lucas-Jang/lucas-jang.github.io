import * as T from 'three';
import {bodyColliders,surface,type BodyCollider} from './bjj-collision';
export type Obstacle={owner:number;name:string;inverse:T.Matrix4;matrix:T.Matrix4;capsule:boolean;collider:BodyCollider};
export type LimbSolution={start:T.Vector3;joint:T.Vector3;end:T.Vector3;rotation:T.Quaternion;goal:T.Vector3;clearance:number;basis:T.Vector3};
export type CandidateSet={owner:number;index:number;start:T.Vector3;end:T.Vector3;goal:T.Vector3;body:T.Quaternion;leg:boolean;candidates:{joint:T.Vector3;end:T.Vector3;goal:T.Vector3;cost:number}[]};
let collector:((set:CandidateSet)=>void)|undefined;
export function setCandidateCollector(value:typeof collector){collector=value;}
const Y=new T.Vector3(0,1,0);
export const MAT=-.015;
export function obstacles(bodies:T.Group[]):Obstacle[]{const volumes=bodyColliders(bodies.map(b=>b.position),bodies.map(b=>b.quaternion));return bodies.flatMap((body,owner)=>[0,1,5].flatMap((index)=>{
  // Named meshes are selected explicitly; the head is a nested group.
  const object=index===5?body.getObjectByName('rig-head'):body.children[index];
  if(!object)return [];object.updateWorldMatrix(true,false);
  const name=index===0?'torso':index===1?'pelvis':'head';
  return [{owner,name,inverse:object.matrixWorld.clone().invert(),matrix:object.matrixWorld.clone(),capsule:index===0,collider:volumes.find(s=>s.owner===owner&&s.name===name)!}];
}));}
export function core(point:T.Vector3,o:Obstacle){const p=point.clone().applyMatrix4(o.inverse);return o.capsule?Math.hypot(p.x,p.z,Math.max(0,Math.abs(p.y)-.1))/.18:p.length();}
export function projectSurface(point:T.Vector3,o:Obstacle,margin=.055){
 const p=point.clone().applyMatrix4(o.inverse),origin=o.capsule?new T.Vector3(0,T.MathUtils.clamp(p.y,-.1,.1),0):new T.Vector3();
 const direction=p.clone().sub(origin);if(direction.lengthSq()<1e-12)direction.set(0,0,1);
 const radius=o.capsule?.18:1;
 const axis=origin.clone().applyMatrix4(o.matrix);
 const surface=origin.add(direction.normalize().multiplyScalar(radius)).applyMatrix4(o.matrix);
 return surface.addScaledVector(surface.clone().sub(axis).normalize(),margin);
}
export function outside(point:T.Vector3,shapes:Obstacle[],margin=.055){
 const result=point.clone();for(let n=0;n<5;n++)for(const o of shapes)if(surface(result,o.collider).distance<margin)result.copy(projectSurface(result,o,margin));return result;
}
export function sharedAnchor(preferred:T.Vector3,starts:T.Vector3[],shapes:Obstacle[]){
 let p=preferred.clone();for(let n=0;n<25;n++){
  for(const start of starts){const d=p.clone().sub(start);if(d.length()>.655)p.copy(start).add(d.setLength(.655));}
  p.copy(outside(p,shapes,.065));
 }
 return p;
}
function candidateCost(start:T.Vector3,joint:T.Vector3,end:T.Vector3,shapes:Obstacle[],owner:number,leg:boolean){
 let cost=0,min=Infinity;
 for(const [a,b,upper]of [[start,joint,true],[joint,end,false]] as const)for(let k=0;k<=10;k++){
  const f=k/10,p=a.clone().lerp(b,f),radius=leg?(upper?.094:.076):(upper?.073:.060);
  const floor=Math.max(0,MAT+radius+.004-p.y);cost+=floor*floor*3000+Math.max(0,floor-.012)*100000;
  for(const o of shapes){
   if(o.owner===owner&&upper&&f*a.distanceTo(b)<(leg?.28:.15)&&(o.name==='torso'||o.name==='pelvis'))continue;
   const distance=surface(p,o.collider).distance;min=Math.min(min,distance-radius);
   const penetration=Math.max(0,radius+.009-distance);cost+=penetration*penetration*3000+Math.max(0,penetration-.004)*100000;
  }
 }
 return {cost,min};
}
export function solveLimb(start:T.Vector3,goal:T.Vector3,pole:T.Vector3,body:T.Quaternion,shapes:Obstacle[],owner:number,leg:boolean,previous?:LimbSolution,index=0,free=false):LimbSolution {
 const l1=leg?.47:.36,l2=leg?.46:.34,range=l1+l2-.003,minRange=Math.sqrt(l1*l1+l2*l2-2*l1*l2*Math.cos(25*Math.PI/180));
 let target=goal.clone();
 // Distal points live on the exterior of body volumes, never at a bone's centre.
 target=outside(target,shapes,leg?.085:.065);
 if(leg)target.y=Math.max(target.y,MAT+.13);
 let bestJoint=new T.Vector3(),bestEnd=target.clone(),bestGoal=target.clone(),bestCost=Infinity,bestClearance=0,rotation=body.clone(),finalBasis=new T.Vector3();
 const baseAxis=target.clone().sub(start).normalize();let baseBasis=previous?previous.basis.clone():pole.clone().sub(start);
 baseBasis.addScaledVector(baseAxis,-baseBasis.dot(baseAxis));if(baseBasis.lengthSq()<1e-10)baseBasis.copy(new T.Vector3(1,0,0).applyQuaternion(body)).addScaledVector(baseAxis,-new T.Vector3(1,0,0).applyQuaternion(body).dot(baseAxis));if(baseBasis.lengthSq()<1e-10)baseBasis.copy(Y).cross(baseAxis);baseBasis.normalize();finalBasis=baseBasis.clone();
 const allCandidates:CandidateSet['candidates']=[];
 for(let variant=leg?-4:0;variant<=(leg?4:0);variant++){
  let option=outside(target.clone().addScaledVector(new T.Vector3(1,0,0).applyQuaternion(body),variant*.05),shapes,leg?.085:.065);
  if(leg){option.y=Math.max(option.y,MAT+.13);const delta=option.clone().sub(start);if(delta.length()>.90)option=start.clone().add(delta.setLength(.90));option.y=Math.max(option.y,MAT+.13);}
  if(free){
    option.y=Math.max(option.y,MAT+.085);
    const delta=option.clone().sub(start);if(delta.length()<minRange){
      const horizontal=new T.Vector3(delta.x,0,delta.z);if(horizontal.lengthSq()<1e-10)horizontal.set(1,0,0);
      const dy=option.y-start.y,length=Math.sqrt(Math.max(.0001,minRange*minRange-dy*dy));horizontal.setLength(length+.001);option.x=start.x+horizontal.x;option.z=start.z+horizontal.z;
    }
  }
  const axis=option.clone().sub(start);const d=T.MathUtils.clamp(axis.length(),minRange,range);axis.normalize();const end=start.clone().addScaledVector(axis,d);
  const along=(l1*l1-l2*l2+d*d)/(2*d),radius=Math.sqrt(Math.max(0,l1*l1-along*along)),centre=start.clone().addScaledVector(axis,along);
  let basis=baseBasis.clone();
  basis.addScaledVector(axis,-basis.dot(axis));
  if(basis.lengthSq()<1e-10){basis=new T.Vector3(1,0,0).applyQuaternion(body);basis.addScaledVector(axis,-basis.dot(axis));}
  if(basis.lengthSq()<1e-10)basis.copy(Y).cross(axis);basis.normalize();const tangent=axis.clone().cross(basis).normalize();
  const desired=pole.clone().sub(centre).normalize();
  for(let n=0;n<72;n++){
   const angle=n*Math.PI*2/72,joint=centre.clone().addScaledVector(basis,Math.cos(angle)*radius).addScaledVector(tangent,Math.sin(angle)*radius);
   const collision=candidateCost(start,joint,end,shapes,owner,leg);
   const continuity=previous?joint.distanceToSquared(previous.joint)*1.2:0;
   const preference=(1-joint.clone().sub(centre).normalize().dot(desired))*.002;
   const cost=collision.cost+continuity+preference+variant*variant*.001;
   allCandidates.push({joint:joint.clone(),end:end.clone(),goal:leg||free?end.clone():option.clone(),cost:collision.cost+preference+variant*variant*.001});
   if(cost<bestCost){bestCost=cost;bestJoint=joint;bestEnd=end.clone();bestGoal=leg||free?end.clone():option.clone();bestClearance=collision.min;}
  }
 }
 collector?.({owner,index,start:start.clone(),end:bestEnd.clone(),goal:bestGoal.clone(),body:body.clone(),leg,candidates:allCandidates});
  const shin=bestJoint.clone().sub(bestEnd).normalize();let toe=new T.Vector3(0,0,1).applyQuaternion(body);toe.addScaledVector(shin,-toe.dot(shin));
  if(toe.lengthSq()<.005){toe=previous?new T.Vector3(0,0,1).applyQuaternion(previous.rotation):new T.Vector3(1,0,0);toe.addScaledVector(shin,-toe.dot(shin));}
  if(toe.lengthSq()<1e-10)toe.copy(Y).cross(shin);toe.normalize();
  if(previous&&toe.dot(new T.Vector3(0,0,1).applyQuaternion(previous.rotation))<0)toe.negate();
  const right=shin.clone().cross(toe).normalize();rotation.setFromRotationMatrix(new T.Matrix4().makeBasis(right,shin,toe));
 return {start,joint:bestJoint,end:bestEnd,rotation,goal:bestGoal,clearance:bestClearance,basis:finalBasis};
}
