import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
const text=await fs.readFile(new URL('../src/scripts/bjj-motion-data.ts',import.meta.url),'utf8');
const data=JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;$/,''));
const V=(a,i)=>new T.Vector3(a[i],a[i+1],a[i+2]);
const tip=(a,i)=>V(a,7+i*16+6);
const elbow=(a,i)=>V(a,7+i*16+3);
const sample=(key,p)=>data[key][Math.round(p*(data[key].length-1))];
const bodyPoint=(person,point)=>new T.Vector3(...point).applyQuaternion(new T.Quaternion(...person.slice(3,7))).add(V(person,0));
test('the reference review includes at least ten distinct Shorts for every technique',async()=>{
 const study=JSON.parse(await fs.readFile(new URL('../src/scripts/bjj-references.json',import.meta.url),'utf8'));
 for(const key of Object.keys(data)){
  const clips=study.references.filter(r=>r.technique===key);
  assert.ok(new Set(clips.map(r=>r.id)).size>=10,key);
  for(const clip of clips){assert.equal(clip.url,`https://www.youtube.com/shorts/${clip.id}`);assert.ok(clip.reviewedRange[0]<clip.reviewedRange[1]&&clip.reviewedRange[1]<=clip.duration);assert.ok(clip.observation.length>10);}
 }
});
test('the double leg lowers first, keeps the head beside the hip, then brings the rear foot up',()=>{
 const initial=sample('double',0)[0],low=sample('double',.13)[0],[entry,partner]=sample('double',.29),follow=sample('double',.44)[0];
 assert.ok(initial[1]-low[1]>.15&&low[0]-initial[0]<.3);
 const head=bodyPoint(entry,[0,.73,0]);assert.ok(head.z-partner[2]>.20&&head.y>partner[1]+.08);
 assert.ok(tip(follow,2).x-tip(entry,2).x>.45);
});
test('the triangle supports a foot at the hip and turns the pelvis before its final lock',()=>{
 const [a,b]=sample('triangle',.12),end=sample('triangle',1)[0];
 assert.ok(tip(a,3).distanceTo(V(b,0))<.36);
 const up=bodyPoint(end,[0,1,0]).sub(V(end,0));assert.ok(Math.atan2(up.z,-up.x)>.5);
});
test('the mount armbar sits down after clearing the head and before lying back',()=>{
 const [s,b]=sample('armbar',.35),seated=sample('armbar',.61)[0],end=sample('armbar',.8)[0];
 assert.ok(elbow(s,2).distanceTo(bodyPoint(b,[0,.73,0]))<.5);
 assert.ok(bodyPoint(seated,[0,1,0]).y-seated[1]>.6);
 assert.ok(bodyPoint(end,[0,1,0]).y-end[1]<.1);
 assert.ok(seated[1]<sample('armbar',.48)[0][1]-.15);
});
test('the omoplata uses the outside hand to rise before taking waist control',()=>{
 const a=sample('omoplata',.65)[0],finish=sample('omoplata',.94)[0];
 assert.ok(Math.abs(tip(a,1).y-.075)<.01);
 assert.ok(bodyPoint(a,[0,1,0]).y-a[1]>.8);
 assert.ok(tip(finish,1).y>.35);
});
test('the bow and arrow secures the pants before the side sit',()=>{
 const [a,b]=sample('bow',.36),pants=bodyPoint(b,[-.18,.04,.04]);
 assert.ok(tip(a,1).distanceTo(pants)<.20);
});
test('all five techniques, including the double leg, have two complete 3D rigs',()=>{
 assert.deepEqual(Object.keys(data).sort(),['armbar','bow','double','omoplata','triangle']);
 for(const [key,frames] of Object.entries(data)){
  assert.equal(frames.length,361,key);
  for(const people of frames){
   assert.equal(people.length,2,key);
   for(const person of people){assert.equal(person.length,71,key);assert.ok(person.every(Number.isFinite),key);}
  }
 }
});
test('both characters keep the same shoulder and hip proportions throughout every clip',()=>{
 for(const [key,frames] of Object.entries(data))for(const people of frames)for(const person of people){
  const hip=V(person,0),q=new T.Quaternion(...person.slice(3,7)),up=new T.Vector3(0,1,0).applyQuaternion(q);
  for(let limb=0;limb<4;limb++){
   const centre=hip.clone().addScaledVector(up,limb<2?.48:0);
   assert.ok(Math.abs(V(person,7+limb*16).distanceTo(centre)-(limb<2?.205:.135))<2e-6,`${key}: changing rig proportions`);
  }
 }
});
test('every generated limb retains its bone lengths and a bounded bend',()=>{
 for(const[key,frames]of Object.entries(data))for(const[f,people]of frames.entries())for(const[p,a]of people.entries())for(let i=0;i<4;i++){
  const k=7+i*16,start=V(a,k),joint=V(a,k+3),end=V(a,k+6),upper=i<2?.36:.47,lower=i<2?.34:.46;
  assert.ok(Math.abs(start.distanceTo(joint)-upper)<2e-6,`${key} F${f} ${p}/${i} upper`);
  assert.ok(Math.abs(joint.distanceTo(end)-lower)<2e-6,`${key} F${f} ${p}/${i} lower`);
  const angle=start.clone().sub(joint).angleTo(end.clone().sub(joint))*180/Math.PI;
  assert.ok(angle>=24.99&&angle<=170,`${key} F${f} ${p}/${i} bend ${angle}`);
 }
});
test('elbows and knees do not jump between consecutive trajectory samples',()=>{
 for(const[key,frames]of Object.entries(data))for(let f=1;f<frames.length;f++)for(let p=0;p<2;p++)for(let i=0;i<4;i++){
  const displacement=elbow(frames[f][p],i).distanceTo(elbow(frames[f-1][p],i));
  assert.ok(displacement<.09,`${key} F${f} ${p}/${i} jump ${displacement}`);
 }
});
test('the ankle uses the shin as its local up axis',()=>{
 for(const[key,frames]of Object.entries(data))for(const[f,people]of frames.entries())for(const a of people)for(let i=2;i<4;i++){
  const k=7+i*16,shin=elbow(a,i).sub(tip(a,i)).normalize(),q=new T.Quaternion(...a.slice(k+9,k+13)),up=new T.Vector3(0,1,0).applyQuaternion(q),toe=new T.Vector3(0,0,1).applyQuaternion(q);
  assert.ok(shin.dot(up)>.99999,`${key} F${f} disconnected ankle`);assert.ok(Math.abs(shin.dot(toe))<1e-5,`${key} F${f} foot folded along shin`);
 }
});
test('the actual feet and joint volumes stay above the mat surface',()=>{
 const floor=-.015;
 for(const[key,frames]of Object.entries(data))for(const[f,people]of frames.entries())for(const a of people)for(let i=0;i<4;i++){
  const k=7+i*16,q=new T.Quaternion(...a.slice(k+9,k+13)),x=new T.Vector3(1,0,0).applyQuaternion(q),y=new T.Vector3(0,1,0).applyQuaternion(q),z=new T.Vector3(0,0,1).applyQuaternion(q);
  const radius=i<2?[.061,.072,.047]:[.067,.055,.12];const extent=Math.sqrt((radius[0]*x.y)**2+(radius[1]*y.y)**2+(radius[2]*z.y)**2);
  assert.ok(tip(a,i).y-extent>=floor-.004,`${key} F${f} ${i} distal mesh below mat`);
  assert.ok(elbow(a,i).y-(i<2?.072:.095)>=floor-.004,`${key} F${f} ${i} joint below mat`);
 }
});
test('shared wrist grips remain in contact after retargeting',()=>{
 for(const[key,frames]of Object.entries(data))for(const[f,people]of frames.entries()){
  const p=f/(frames.length-1),[a,b]=people,pairs=[];
  if(key==='triangle')pairs.push([0,0]);
  if(key==='armbar')pairs.push([0,0],[1,0]);
  if(key==='omoplata'&&(p<=.25||p>=.79))pairs.push([1,0]);
  for(const[i,j]of pairs){const d=tip(a,i).distanceTo(tip(b,j));assert.ok(d>=.055&&d<=.17,`${key} F${f} grip ${i}/${j}: ${d}`);}
  if(key==='armbar')assert.ok(tip(a,0).distanceTo(tip(a,1))>.14,`armbar F${f}: hands intersect`);
 }
});
test('the finished triangle keeps the ankle close to the opposite knee',()=>{
 const frames=data.triangle;for(let f=Math.ceil((frames.length-1)*.94);f<frames.length;f++){
  const a=frames[f][0],gap=tip(a,2).distanceTo(elbow(a,3));assert.ok(gap<.20,`triangle F${f}: open leg lock ${gap}`);
 }
});
test('limb centrelines stay out of nonadjacent head and body cores',()=>{
 for(const[key,frames]of Object.entries(data))for(const[f,people]of frames.entries()){
  const shapes=people.map(a=>{const h=V(a,0),q=new T.Quaternion(...a.slice(3,7)),up=new T.Vector3(0,1,0).applyQuaternion(q);return [
   {name:'torso',capsule:true,inverse:new T.Matrix4().compose(h.clone().addScaledVector(up,.27),q,new T.Vector3(1.13,1,.83)).invert()},
   {name:'head',capsule:false,inverse:new T.Matrix4().compose(h.clone().addScaledVector(up,.73),q,new T.Vector3(.145,.17,.14)).invert()},
   {name:'pelvis',capsule:false,inverse:new T.Matrix4().compose(h.clone().addScaledVector(up,.02),q,new T.Vector3(.21,.15,.145)).invert()}
  ];});
  for(let person=0;person<2;person++)for(let limb=0;limb<4;limb++){
   const a=people[person],k=7+limb*16;
   for(const[begin,end,upper]of[[V(a,k),V(a,k+3),true],[V(a,k+3),V(a,k+6),false]])for(let sample=0;sample<=20;sample++){
    const p=begin.clone().lerp(end,sample/20);
    for(let other=0;other<2;other++)for(const shape of shapes[other]){
     if(other===person&&upper&&sample/20<.55)continue;
     const v=p.clone().applyMatrix4(shape.inverse),score=shape.capsule?Math.hypot(v.x,v.z,Math.max(0,Math.abs(v.y)-.1))/.18:v.length();
     assert.ok(score>=.74,`${key} F${f}: ${person}/${limb} enters ${other}/${shape.name} core (${score})`);
    }
   }
  }
 }
});
