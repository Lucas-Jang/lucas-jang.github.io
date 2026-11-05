// A focused repair must preserve the rest of the actual displayed animation.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
import path from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const original=process.env.BJJ_ORIGINAL_ASSET??'.astro/bjj-current-runtime/original.glb';
const repaired=process.env.BJJ_REPAIRED_ASSET??'.astro/bjj-right-leg-export/triangle-study.glb';
async function load(file){
  const bytes=await fs.readFile(file),m=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const skins=[];m.scene.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});const mixer=new T.AnimationMixer(m.scene);
  const actions=m.animations.map(c=>{const a=mixer.clipAction(c);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();return a;});
  return {skins,seek(t){for(const a of actions){a.enabled=true;a.paused=false;}mixer.setTime(t);m.scene.updateMatrixWorld(true);}};
}
const [a,b]=await Promise.all([load(original),load(repaired)]);assert.equal(a.skins.length,2);assert.equal(b.skins.length,2);
const raw=bone=>bone.userData.name??bone.name;
const leg=(bone,side='R')=>{for(let n=bone;n;n=n.parent)if(n.isBone&&raw(n)===`upperleg01.${side}`)return true;return false;};
const allowRightMotion=process.env.BJJ_ALLOW_RIGHT_MOTION==='1';
const allowLockLegMotion=process.env.BJJ_ALLOW_LOCK_LEG_MOTION==='1';
const allowLeftRoll=process.env.BJJ_ALLOW_LEFT_ROLL==='1';
const timing=process.env.BJJ_SHARED_RETIME==='1'?JSON.parse(await fs.readFile('src/scripts/bjj-triangle-timing.json','utf8')):[[0,0],[22,22]];
function sourceTime(t){const i=Math.max(0,timing.findIndex(k=>t<k[0])-1);const [a,b]=t>=22?timing.slice(-2):timing.slice(i,i+2);return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}
const matrices=[new T.Matrix4(),new T.Matrix4()];let maximumUnchanged=0,maximumJoint=0,maximumRightJoint=0,maximumLeftJoint=0,checked=0;
const matches=a.skins.map((s,p)=>s.skeleton.bones.map((bone,i)=>({bone,other:b.skins[p].skeleton.bones.find(n=>raw(n)===raw(bone)),inverse:s.skeleton.boneInverses[i]})));
for(let frame=0;frame<=22*60;frame++){
  a.seek(sourceTime(frame/60));b.seek(frame/60);
  for(let p=0;p<2;p++)for(const {bone,other,inverse} of matches[p]){
    assert.ok(other);const isRight=p===0&&leg(bone);const isLeftRoll=allowLeftRoll&&p===0&&leg(bone,'L');const isLockLeg=allowLockLegMotion&&frame/60>=13.5&&p===0&&leg(bone,'L');
    if(!isRight&&!isLockLeg&&!isLeftRoll){
      const j=b.skins[p].skeleton.bones.indexOf(other);
      matrices[0].copy(bone.matrixWorld).multiply(inverse);matrices[1].copy(other.matrixWorld).multiply(b.skins[p].skeleton.boneInverses[j]);
      for(let k=0;k<16;k++)maximumUnchanged=Math.max(maximumUnchanged,Math.abs(matrices[0].elements[k]-matrices[1].elements[k]));checked++;
    }
    const distance=new T.Vector3().setFromMatrixPosition(bone.matrixWorld).distanceTo(new T.Vector3().setFromMatrixPosition(other.matrixWorld));
    if(isRight)maximumRightJoint=Math.max(maximumRightJoint,distance);
    if(isLockLeg)maximumLeftJoint=Math.max(maximumLeftJoint,distance);
    if((!isRight&&!isLockLeg&&(!isLeftRoll||!raw(bone).startsWith('toe')))||raw(bone).startsWith('upperleg01.')||(!allowRightMotion&&isRight&&!raw(bone).startsWith('toe')))maximumJoint=Math.max(maximumJoint,distance);
  }
}
assert.ok(maximumUnchanged<.0002,`Other poses changed by ${maximumUnchanged}`);
// Changing axial roll changes composed SLERP between original 24Hz keys by a
// fraction of a millimetre, although their joint centres match at every key.
assert.ok(maximumJoint<.0005,`Joint centres moved by ${maximumJoint}m`);
const result={times:1321,unchangedBoneTransforms:checked,maximumUnchangedMatrixComponent:maximumUnchanged,maximumJointCentreChangeMeters:maximumJoint,maximumRightJointCentreChangeMeters:maximumRightJoint,maximumClosingLeftJointCentreChangeMeters:maximumLeftJoint,allowRightMotion,allowLockLegMotion,allowLeftRoll};
await fs.writeFile(path.join(path.dirname(repaired),'original-motion-parity.json'),JSON.stringify(result,null,2));console.log(result);
