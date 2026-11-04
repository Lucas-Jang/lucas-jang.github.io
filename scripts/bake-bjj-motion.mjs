import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
await fs.mkdir(new URL('../.astro/',import.meta.url),{recursive:true});
const require=createRequire(new URL('../package.json',import.meta.url)),{build}=require('esbuild');
const source=await fs.readFile(new URL('../src/scripts/bjj-widget.ts',import.meta.url),'utf8');
await build({stdin:{contents:source+'\nexport {Grappler,THREE,techniques};',resolveDir:fileURLToPath(new URL('../src/scripts/',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:fileURLToPath(new URL('../.astro/bjj-bake-runtime.cjs',import.meta.url)),logLevel:'silent'});
const {Grappler,THREE:T,techniques,posePair,setUseMotionData,setCandidateCollector}=require(fileURLToPath(new URL('../.astro/bjj-bake-runtime.cjs',import.meta.url)));
setUseMotionData(false);
const sides={double:[1,1],triangle:[-1,1],armbar:[1,-1],omoplata:[-1,1],bow:[1,1]},motion={},diagnostics={};
const selected=process.argv.slice(2);
if(selected.some(key=>!sides[key]))throw new Error('Unknown technique');
if(selected.length){
 const text=await fs.readFile(new URL('../src/scripts/bjj-motion-data.ts',import.meta.url),'utf8');
 Object.assign(motion,JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;$/,'')));
}
const N=361;
for(const [key,side]of Object.entries(sides)){
if(selected.length&&!selected.includes(key))continue;
const scene=new T.Scene(),players=[new Grappler(scene,0xffffff,0x888888),new Grappler(scene,0xffffff,0x888888)],frames=[];
let current;
setCandidateCollector(set=>{current.sets[set.owner*4+set.index]=set;});
for(let f=0;f<N;f++){
  const p=f/(N-1),tech=techniques[key];let i=0;while(i<tech.frames.length-2&&p>=tech.frames[i+1].t)i++;
  const a=tech.frames[i],b=tech.frames[i+1],x=T.MathUtils.clamp((p-a.t)/(b.t-a.t),0,1),t=x*x*(3-2*x);
  current={sets:[],bodies:[]};posePair(players,a.a,b.a,a.b,b.b,t,side,key,p);scene.updateMatrixWorld(true);
  current.bodies=players.map(g=>[...g.body.position.toArray(),...g.body.quaternion.toArray()]);frames.push(current);
}
const paths=[];const pathInfo=[];
for(let limb=0;limb<8;limb++){
 const K=frames[0].sets[limb].candidates.length,variants=K/72;
 const back=Array.from({length:N},()=>new Int16Array(K));let previous=Float64Array.from(frames[0].sets[limb].candidates,c=>c.cost);
 for(let f=1;f<N;f++){
  const next=new Float64Array(K).fill(Infinity),a=frames[f-1].sets[limb],b=frames[f].sets[limb];
  for(let j=0;j<K;j++)for(let dv=-1;dv<=1;dv++)for(let d=-2;d<=2;d++){
   const variant=Math.floor(j/72)+dv;if(variant<0||variant>=variants)continue;
   const from=variant*72+(j%72+d+72)%72,distance=b.candidates[j].joint.distanceTo(a.candidates[from].joint),endDistance=b.candidates[j].end.distanceTo(a.candidates[from].end);
   let closure=0;if(key==='triangle'&&limb===3){const anchor=frames[f].sets[2].candidates[paths[2][f]].end,gap=b.candidates[j].joint.distanceTo(anchor);closure=Math.max(0,gap-.055)**2*10000*T.MathUtils.smoothstep(f/(N-1),.65,.9);}
   const cost=previous[from]+b.candidates[j].cost+closure+distance*distance*2+endDistance*endDistance*2+(distance>.085?100000*(distance-.085):0)+(endDistance>.07?100000*(endDistance-.07):0);
   if(cost<next[j]){next[j]=cost;back[f][j]=from;}
  }
  previous=next;
 }
 let best=0;for(let j=1;j<K;j++)if(previous[j]<previous[best])best=j;
 const path=new Int16Array(N);path[N-1]=best;for(let f=N-1;f>0;f--)path[f-1]=back[f][path[f]];paths.push(path);
 let maxJump=0,maxCost=0;for(let f=0;f<N;f++){const s=frames[f].sets[limb],c=s.candidates[path[f]];maxCost=Math.max(maxCost,c.cost);if(f)maxJump=Math.max(maxJump,c.joint.distanceTo(frames[f-1].sets[limb].candidates[path[f-1]].joint));}
 pathInfo.push({limb,maxJump,maxCost});
}
motion[key]=frames.map((frame,f)=>frame.bodies.map((body,person)=>{
 const result=body.slice();
 for(let i=0;i<4;i++){
  const set=frame.sets[person*4+i],selected=set.candidates[paths[person*4+i][f]],joint=selected.joint,end=selected.end,shin=joint.clone().sub(end).normalize();
  let toe=new T.Vector3(0,0,1).applyQuaternion(set.body);toe.addScaledVector(shin,-toe.dot(shin));if(toe.lengthSq()<.005){toe=new T.Vector3(1,0,0);toe.addScaledVector(shin,-toe.dot(shin));}toe.normalize();
  const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(shin.clone().cross(toe).normalize(),shin,toe));
  result.push(...set.start.toArray(),...joint.toArray(),...end.toArray(),...q.toArray(),...selected.goal.toArray());
 }
 return result.map(n=>+n.toFixed(7));
}));
diagnostics[key]=pathInfo;console.log(key,JSON.stringify(pathInfo));
}
await fs.writeFile(new URL('../src/scripts/bjj-motion-data.ts',import.meta.url),'// Offline constrained trajectories, 361 normalized-time samples per clip; authored poses and shared grip anchors.\nexport const motionData:Record<string,number[][][]>='+JSON.stringify(motion)+';\n');
await fs.writeFile(new URL('../.astro/bjj-bake-diagnostics.json',import.meta.url),JSON.stringify(diagnostics,null,2));
