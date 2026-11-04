import * as T from 'three';
const equivalentHalfTurn=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
// This is the interpolation used by the renderer AND by the collision audit.
// Reconstruct the elbow/knee on the two-bone circle rather than lerping it
// through the body or shortening the bones between stored samples.
export function sampleMotion(data:number[][][],progress:number):number[][]{
 const f=T.MathUtils.clamp(progress,0,1)*(data.length-1),index=Math.min(data.length-2,Math.floor(f)),t=f-index;
 return [0,1].map(person=>{
  const a=data[index][person],b=data[index+1][person];
  const vec=(offset:number)=>new T.Vector3(a[offset],a[offset+1],a[offset+2]).lerp(new T.Vector3(b[offset],b[offset+1],b[offset+2]),t);
  const q=new T.Quaternion(...a.slice(3,7) as [number,number,number,number]).slerp(new T.Quaternion(...b.slice(3,7) as [number,number,number,number]),t);
  const result=[...vec(0).toArray(),...q.toArray()];
  for(let i=0;i<4;i++){
   const offset=7+i*16,start=vec(offset),end=vec(offset+6),guess=vec(offset+3),l1=i>=2?.47:.36,l2=i>=2?.46:.34;
   const axis=end.clone().sub(start),d=Math.max(1e-9,axis.length());axis.normalize();
   const along=(l1*l1-l2*l2+d*d)/(2*d),centre=start.clone().addScaledVector(axis,along),radius=Math.sqrt(Math.max(0,l1*l1-along*along));
   const bend=guess.clone().sub(centre);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
   const joint=centre.clone().addScaledVector(bend,radius),shin=joint.clone().sub(end).normalize();
   const from=new T.Quaternion(...a.slice(offset+9,offset+13) as [number,number,number,number]);
   const to=new T.Quaternion(...b.slice(offset+9,offset+13) as [number,number,number,number]);
   // The hand/foot is an ellipsoid: a local half turn about the shin axis
   // displays the same mesh. Interpolating between those equivalent poses
   // would unnecessarily swing its long axis sideways through a nearby arm.
   const equivalent=to.clone().multiply(equivalentHalfTurn);
   if(Math.abs(from.dot(equivalent))>Math.abs(from.dot(to)))to.copy(equivalent);
   const stored=from.slerp(to,t);
   const toe=new T.Vector3(0,0,1).applyQuaternion(stored);toe.addScaledVector(shin,-toe.dot(shin)).normalize();
   const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(shin.clone().cross(toe).normalize(),shin,toe));
   result.push(...start.toArray(),...joint.toArray(),...end.toArray(),...rotation.toArray(),...vec(offset+13).toArray());
  }
  return result;
 });
}
