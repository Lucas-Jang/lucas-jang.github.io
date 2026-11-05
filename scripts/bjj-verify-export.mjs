// Authoring-to-runtime skin parity. Never substitutes for contact/visual review.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=process.env.BJJ_EXPORT_DIR?pathToFileURL(path.resolve(process.env.BJJ_EXPORT_DIR)+path.sep):new URL('../.astro/bjj-rebuild/',import.meta.url);
const data=JSON.parse(await fs.readFile(new URL('skin-witness.json',dir),'utf8'));
const bytes=await fs.readFile(new URL('triangle-study.glb',dir));
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const skins=[];model.scene.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});
assert.equal(skins.length,2);
const mixer=new T.AnimationMixer(model.scene);
const actions=model.animations.map(clip=>{const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();return action;});
const key=v=>v.map(x=>Math.round(x*1e5)).join(',');
const maps=skins.map(s=>{const positions=s.geometry.getAttribute('position'),m=new Map();for(let i=0;i<positions.count;i++)m.set(key([positions.getX(i),positions.getY(i),positions.getZ(i)]),i);return m;});
let maximum=0,points=0;
for(let f=0;f<data.times.length;f++){
  for(const a of actions){a.paused=false;a.enabled=true;}
  mixer.setTime(data.times[f]);model.scene.updateMatrixWorld(true);
  for(let p=0;p<2;p++){
    const skin=skins.find(s=>s.name===data.actors[p].name.replaceAll(' ','_'))??skins[p];
    const index=skins.indexOf(skin),rest=skin.geometry.getAttribute('position');
    for(let k=0;k<data.actors[p].rest.length;k++){
      const id=maps[index].get(key(data.actors[p].rest[k]));assert.notEqual(id,undefined,'Witness vertex missing');
      const v=new T.Vector3().fromBufferAttribute(rest,id);skin.applyBoneTransform(id,v);v.applyMatrix4(skin.matrixWorld);
      const error=v.distanceTo(new T.Vector3(...data.actors[p].positions[f][k]));maximum=Math.max(error,maximum);points++;
      assert.ok(error<.0002,`Skin differs by ${error}m at ${data.times[f]}s, ${skin.name}, vertex ${id}`);
    }
  }
}
const dense=JSON.parse(await fs.readFile(new URL('pose-witness.json',dir),'utf8'));
const denseBytes=await fs.readFile(new URL('pose-witness.bin',dir));
const matrices=new Float32Array(denseBytes.buffer.slice(denseBytes.byteOffset,denseBytes.byteOffset+denseBytes.byteLength));
assert.equal(matrices.length,dense.times.length*2*dense.names.length*16);
const source=new T.Matrix4(),expected=new T.Matrix4(),calibration=[],boneLists=[];
const at=(frame,person,bone)=>source.fromArray(matrices,((frame*2+person)*dense.names.length+bone)*16).transpose();
const seek=time=>{for(const a of actions){a.paused=false;a.enabled=true;}mixer.setTime(time);model.scene.updateMatrixWorld(true);};
seek(0);
for(let p=0;p<2;p++){
  const skin=skins.find(s=>s.name===dense.actors[p].replaceAll(' ','_'))??skins[p];
  boneLists[p]=dense.names.map(name=>{const bone=skin.skeleton.bones.find(b=>b.userData.name===name);assert.ok(bone,`Bone ${name} missing`);return bone;});
  calibration[p]=boneLists[p].map((bone,i)=>{
    const correction=at(0,p,i).clone().invert().multiply(bone.matrixWorld);
    assert.ok(new T.Vector3().setFromMatrixPosition(correction).length()<.0002,'Unexpected bone origin conversion');
    correction.setPosition(0,0,0);return correction;
  });
}
let boneTransforms=0,maximumBoneMatrixError=0,maximumJointPositionError=0;
for(let f=0;f<dense.times.length;f++){
  seek(dense.times[f]);
  for(let p=0;p<2;p++)for(let b=0;b<dense.names.length;b++){
    expected.copy(at(f,p,b)).multiply(calibration[p][b]);const actual=boneLists[p][b].matrixWorld;
    let error=0;for(let k=0;k<16;k++)error=Math.max(error,Math.abs(actual.elements[k]-expected.elements[k]));
    maximumBoneMatrixError=Math.max(maximumBoneMatrixError,error);
    const distance=Math.hypot(actual.elements[12]-expected.elements[12],actual.elements[13]-expected.elements[13],actual.elements[14]-expected.elements[14]);
    maximumJointPositionError=Math.max(maximumJointPositionError,distance);boneTransforms++;
    assert.ok(error<.0002,`Pose differs by ${error} at ${dense.times[f]}s, ${dense.names[b]}`);
  }
}
const result={points,maximumSkinErrorMeters:maximum,denseTimes:dense.times.length,boneTransforms,maximumBoneMatrixError,maximumJointPositionErrorMeters:maximumJointPositionError};
await fs.writeFile(new URL('export-parity.json',dir),JSON.stringify(result,null,2));
console.log(result);
