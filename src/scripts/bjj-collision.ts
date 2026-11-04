import * as T from 'three';
export type BodyCollider={owner:number;name:string;centre:T.Vector3;inverse:T.Quaternion;rotation:T.Quaternion;radii:T.Vector3;half:number;limb?:number};
export type Bone={owner:number;limb:number;part:number;a:T.Vector3;b:T.Vector3;radius:number};
export type Contact={kind:string;depth:number;point:T.Vector3;normal:T.Vector3;owner:number;other:number;limb?:number;part?:number;bone?:Bone;peer?:Bone;shape?:BodyCollider};
const Y=new T.Vector3(0,1,0);
export function bodyColliders(positions:T.Vector3[],rotations:T.Quaternion[]):BodyCollider[]{
 return positions.flatMap((position,owner)=>[
  ['torso',.27,[.2034,.18,.1494],.1],['pelvis',.02,[.21,.15,.145],0],
  ['neck',.58,[.07,.10,.07],0],['head',.73,[.15,.177,.145],0]
 ].map(([name,height,radii,half])=>({owner,name:name as string,centre:position.clone().addScaledVector(Y.clone().applyQuaternion(rotations[owner]),height as number),rotation:rotations[owner].clone(),inverse:rotations[owner].clone().invert(),radii:new T.Vector3(...radii as [number,number,number]),half:half as number})));
}
// Conservative world-space distance to the visible ellipsoid / swept ellipsoid.
// Unlike the old dimensionless core score, this includes the actual limb radius.
export function surface(point:T.Vector3,shape:BodyCollider){
 const p=point.clone().sub(shape.centre).applyQuaternion(shape.inverse);
 p.y-=T.MathUtils.clamp(p.y,-shape.half,shape.half);
 const r=shape.radii,k=Math.hypot(p.x/r.x,p.y/r.y,p.z/r.z),small=Math.min(r.x,r.y,r.z);
 const gradient=new T.Vector3(p.x/(r.x*r.x),p.y/(r.y*r.y),p.z/(r.z*r.z));
 if(gradient.lengthSq()<1e-16)gradient.set(0,0,1);
 const magnitude=small*gradient.length()/Math.max(k,1e-12);
 return {distance:(k-1)*small,normal:gradient.normalize().applyQuaternion(shape.rotation),magnitude:Math.max(.25,magnitude)};
}
export function closestSegments(a:T.Vector3,b:T.Vector3,c:T.Vector3,d:T.Vector3){
 const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),aa=u.dot(u),bb=u.dot(v),cc=v.dot(v),dd=u.dot(w),ee=v.dot(w),den=aa*cc-bb*bb;
 let s=den>1e-12?T.MathUtils.clamp((bb*ee-cc*dd)/den,0,1):0;
 let t=cc>1e-12?(bb*s+ee)/cc:0;
 if(t<0){t=0;s=aa>1e-12?T.MathUtils.clamp(-dd/aa,0,1):0;}
 else if(t>1){t=1;s=aa>1e-12?T.MathUtils.clamp((bb-dd)/aa,0,1):0;}
 const p=a.clone().addScaledVector(u,s),q=c.clone().addScaledVector(v,t);
 return {p,q,s,t,distance:p.distanceTo(q)};
}
export function motionRig(people:number[][]){
 const vector=(a:number[],i:number)=>new T.Vector3(a[i],a[i+1],a[i+2]);
 const positions=people.map(a=>vector(a,0)),rotations=people.map(a=>new T.Quaternion(...a.slice(3,7) as [number,number,number,number]));
 const bones:Bone[]=people.flatMap((a,owner)=>Array.from({length:4},(_,limb)=>{
  const k=7+limb*16,start=vector(a,k),joint=vector(a,k+3),end=vector(a,k+6),leg=limb>=2;
  return [{owner,limb,part:0,a:start,b:joint,radius:leg?.094:.073},{owner,limb,part:1,a:joint,b:end,radius:leg?.076:.060}];
 }).flat());
 const tips:BodyCollider[]=people.flatMap((a,owner)=>Array.from({length:4},(_,limb)=>{
  const k=7+limb*16,rotation=new T.Quaternion(...a.slice(k+9,k+13) as [number,number,number,number]);
  return {owner,limb,name:(limb<2?'hand':'foot')+limb,centre:vector(a,k+6),rotation,inverse:rotation.clone().invert(),radii:new T.Vector3(...(limb<2?[.061,.072,.047]:[.067,.055,.12]) as [number,number,number]),half:0};
 }));
 return {positions,rotations,bones,tips,shapes:bodyColliders(positions,rotations)};
}
export function attached(bone:Bone,shape:BodyCollider,t:number){
 // The proximal cylinder is deliberately embedded into its own shoulder / hip
 // mesh. Only that connected region is exempt; the opponent never is.
 return bone.owner===shape.owner&&bone.part===0&&t*bone.a.distanceTo(bone.b)<(bone.limb<2?.15:.28)&&(shape.name==='torso'||shape.name==='pelvis');
}
export function contacts(people:number[][],margin=0):Contact[]{
 const {bones,shapes,tips}=motionRig(people),result:Contact[]=[];
 for(const bone of bones)for(const shape of [...shapes,...tips]){
  if(shape.limb!==undefined&&shape.owner===bone.owner&&shape.limb===bone.limb)continue;
  let worst:Contact|undefined;
  for(let sample=0;sample<=16;sample++){
   const t=sample/16;if(attached(bone,shape,t))continue;
   const point=bone.a.clone().lerp(bone.b,t),s=surface(point,shape),depth=bone.radius+margin-s.distance;
   if(depth>0&&(!worst||depth>worst.depth))worst={kind:shape.limb===undefined?'limb-body':'limb-tip',depth,point,normal:s.normal,owner:bone.owner,other:shape.owner,limb:bone.limb,part:bone.part,bone,shape};
  }
  if(worst)result.push(worst);
 }
 for(let i=0;i<bones.length;i++)for(let j=i+1;j<bones.length;j++){
  const a=bones[i],b=bones[j];if(a.owner===b.owner&&a.limb===b.limb)continue;
  const closest=closestSegments(a.a,a.b,b.a,b.b),depth=a.radius+b.radius+margin-closest.distance;
  if(depth<=0)continue;
  // Two upper arms/legs are attached to the same shoulder/pelvis volume.
  if(a.owner===b.owner&&a.part===0&&b.part===0&&Math.floor(a.limb/2)===Math.floor(b.limb/2)&&closest.s<.2&&closest.t<.2)continue;
  const normal=closest.p.clone().sub(closest.q);if(normal.lengthSq()<1e-12)normal.crossVectors(a.b.clone().sub(a.a),b.b.clone().sub(b.a));if(normal.lengthSq()<1e-12)normal.set(0,0,1);
  result.push({kind:'limb-limb',depth,point:closest.p,normal:normal.normalize(),owner:a.owner,other:b.owner,limb:a.limb,part:a.part,bone:a,peer:b});
 }
 // Check the actual body surface in both directions, not only limb centrelines.
 for(const a of [...shapes,...tips])for(const b of [...shapes,...tips]){
  if(a===b)continue;
  if(a.limb===undefined&&b.limb===undefined&&a.owner===b.owner)continue;
  let worst:Contact|undefined;
  for(let i=0;i<42;i++){
   const y=1-2*(i+.5)/42,angle=i*2.399963229728653,rad=Math.sqrt(1-y*y);
   const point=new T.Vector3(rad*Math.cos(angle)*a.radii.x,y*a.radii.y+Math.sign(y)*a.half,rad*Math.sin(angle)*a.radii.z).applyQuaternion(a.rotation).add(a.centre);
   const s=surface(point,b),depth=margin-s.distance;
   if(depth>0&&(!worst||depth>worst.depth))worst={kind:a.limb===undefined&&b.limb===undefined?'body-body':a.limb!==undefined&&b.limb!==undefined?'tip-tip':'tip-body',depth,point,normal:s.normal,owner:a.owner,other:b.owner,limb:a.limb,shape:b};
  }
  if(worst)result.push(worst);
 }
 return result;
}
