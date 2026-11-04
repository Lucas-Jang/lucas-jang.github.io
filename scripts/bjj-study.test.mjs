// Asset/runtime integration checks. These do not certify technique or realism.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
await fs.mkdir(new URL('../.astro/',import.meta.url),{recursive:true});
await build({stdin:{contents:"export * as T from 'three';export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';export {seekStudyTime} from './src/scripts/bjj-study.ts';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:'.astro/bjj-study-test.cjs',logLevel:'silent'});
const {T,GLTFLoader,seekStudyTime}=createRequire(import.meta.url)('../.astro/bjj-study-test.cjs');
const bytes=await fs.readFile(process.env.BJJ_STUDY_ASSET??new URL('../src/assets/bjj/triangle-study.glb',import.meta.url));
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const skins=[];model.scene.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});
const mixer=new T.AnimationMixer(model.scene),actions=model.animations.map(clip=>{const a=mixer.clipAction(clip);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();return a;});
const snapshot=time=>{seekStudyTime(mixer,actions,time);model.scene.updateMatrixWorld(true);return skins.map(s=>s.skeleton.bones.map(b=>b.getWorldPosition(new T.Vector3()).toArray()));};

test('the exported scene contains two equally proportioned weighted human surfaces',()=>{
  assert.equal(skins.length,2);
  const a=skins[0].geometry.getAttribute('position'),b=skins[1].geometry.getAttribute('position');
  assert.equal(a.count,b.count);assert.ok(a.count>10000);
  for(let i=0;i<a.array.length;i++)assert.ok(Math.abs(a.array[i]-b.array[i])<1e-6);
  for(const skin of skins){assert.equal(skin.skeleton.bones.length,163);assert.ok(skin.geometry.getAttribute('skinWeight'));assert.ok(skin.geometry.getAttribute('color'));}
});
test('both actors have full duration finite animation tracks',()=>{
  assert.ok(model.animations.length>=1);
  const targets=new Set();
  for(const clip of model.animations){assert.ok(Math.abs(clip.duration-22)<1e-4);for(const track of clip.tracks){targets.add(track.name);assert.ok([...track.values].every(Number.isFinite));}}
  assert.ok([...targets].some(n=>n.includes('spine05')));assert.ok([...targets].some(n=>n.includes('neck01')));assert.ok([...targets].some(n=>n.includes('finger')));
});
test('seeking backwards after the end restores both actors deterministically',()=>{
  const before=snapshot(8);snapshot(22);snapshot(0);const after=snapshot(8);
  assert.deepEqual(after,before);
});
test('the exported full clip has no frame-to-frame bone teleportation',()=>{
  let previous=snapshot(0),maximum=0;
  for(let frame=1;frame<=22*60;frame++){
    const next=snapshot(frame/60);
    for(let p=0;p<next.length;p++)for(let bone=0;bone<next[p].length;bone++){
      const delta=Math.hypot(...next[p][bone].map((v,i)=>v-previous[p][bone][i]));maximum=Math.max(maximum,delta);
      assert.ok(next[p][bone].every(v=>Number.isFinite(v)&&Math.abs(v)<4));
    }
    previous=next;
  }
  assert.ok(maximum<.10,`largest 1/60-second bone displacement: ${maximum}m`);
});
