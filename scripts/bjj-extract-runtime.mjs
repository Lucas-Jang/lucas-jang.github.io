// Read the animation actually shown by the widget, including both actors.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const source=process.env.BJJ_STUDY_ASSET??'src/assets/bjj/triangle-study.glb';
const out=process.env.BJJ_RUNTIME_OUT??'.astro/bjj-current-runtime';
await fs.mkdir(out,{recursive:true});const bytes=await fs.readFile(source);
await fs.writeFile(path.join(out,'original.glb'),bytes);
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const skins=[];model.scene.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});assert.equal(skins.length,2);
const names=skins.map(s=>s.skeleton.bones.map(b=>b.userData.name??b.name));
assert.deepEqual(names[0],names[1]);
const rows=m=>m.clone().transpose().toArray();
const bind=skins.map(s=>s.skeleton.boneInverses.map(rows));
const mixer=new T.AnimationMixer(model.scene),actions=model.animations.map(c=>{const a=mixer.clipAction(c);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();return a;});
const times=Array.from({length:529},(_,i)=>i/24),world=new Float64Array(times.length*2*names[0].length*16);
for(let f=0;f<times.length;f++){
  for(const a of actions){a.enabled=true;a.paused=false;}mixer.setTime(times[f]);model.scene.updateMatrixWorld(true);
  for(let p=0;p<2;p++)for(let b=0;b<names[p].length;b++)world.set(rows(skins[p].skeleton.bones[b].matrixWorld),((f*2+p)*names[p].length+b)*16);
}
await fs.writeFile(path.join(out,'runtime-world.bin'),new Uint8Array(world.buffer));
await fs.writeFile(path.join(out,'runtime-world.json'),JSON.stringify({source,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),times,names:names[0],inverseBind:bind,shape:[times.length,2,names[0].length,4,4],actors:skins.map(s=>s.name),storage:'little-endian float64 row-major'}));
console.log('EXTRACTED_CURRENT_RUNTIME',times.length,'frames',names[0].length,'bones per actor');
