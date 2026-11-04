import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { techniques, type Pose, type V } from './bjj-poses';
import {obstacles,solveLimb,sharedAnchor,outside,type Obstacle,type LimbSolution} from './bjj-constraints';
import {motionData} from './bjj-motion-data';
export {setCandidateCollector} from './bjj-constraints';
let useMotionData=true;
export function setUseMotionData(value:boolean){useMotionData=value;}

const v = (a:V) => new THREE.Vector3(...a);
const yAxis = new THREE.Vector3(0,1,0);
const sphere = new THREE.SphereGeometry(1,20,14);
const cylinder = new THREE.CylinderGeometry(1,1,1,16);
function material(color:number) { return new THREE.MeshStandardMaterial({color,roughness:.88}); }
function mesh(g:THREE.BufferGeometry,m:THREE.Material,scale:V,parent:THREE.Object3D) {
  const object = new THREE.Mesh(g,m); object.scale.set(...scale); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function segment(object:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3,radius:number) {
  const delta = b.clone().sub(a);
  object.position.copy(a).add(b).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(yAxis,delta.clone().normalize());
  object.scale.set(radius,delta.length(),radius);
}
function orientation(p:Pose) {
  const up=v(p.u).normalize();
  const forward=v(p.f).addScaledVector(up,-v(p.f).dot(up)).normalize();
  const right=up.clone().cross(forward).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
}
class Grappler {
  root=new THREE.Group(); body=new THREE.Group(); head=new THREE.Group();
  solutions:LimbSolution[]=[];
  limbs: {upper:THREE.Mesh; lower:THREE.Mesh; joint:THREE.Mesh; tip:THREE.Mesh; cuff:THREE.Mesh; foot:boolean}[]=[];
  constructor(scene:THREE.Scene,color:number,beltColor:number) {
    scene.add(this.root); this.root.add(this.body);
    const gi=material(color),skin=material(0xd4a88e),hair=material(0x293c47),trim=material(color===0xf2efe5?0xc4ced0:0xadc2d1),belt=material(beltColor);
    const torso=mesh(new THREE.CapsuleGeometry(.18,.2,6,16),gi,[1.13,1,.83],this.body); torso.position.y=.27;
    const pelvis=mesh(sphere,gi,[.21,.15,.145],this.body); pelvis.position.y=.02;
    const waist=mesh(new THREE.TorusGeometry(.181,.025,8,32),belt,[1,.8,1],this.body); waist.rotation.x=Math.PI/2; waist.position.y=.075;
    const knot=mesh(sphere,belt,[.045,.037,.025],this.body); knot.position.set(0,.07,.156);
    for(const sign of [-1,1]) {
      const lapel=mesh(cylinder,trim,[1,1,1],this.body);
      segment(lapel,new THREE.Vector3(sign*.115,.48,.14),new THREE.Vector3(-sign*.055,.13,.17),.019);
      const tail=mesh(cylinder,belt,[1,1,1],this.body);
      segment(tail,new THREE.Vector3(sign*.015,.07,.17),new THREE.Vector3(sign*.055,-.12,.18),.018);
    }
    const neck=mesh(sphere,skin,[.07,.10,.07],this.body); neck.position.y=.58;
    this.body.add(this.head); this.head.position.y=.73;
    mesh(sphere,skin,[.145,.17,.14],this.head).name='rig-head';
    const cap=mesh(new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.46),hair,[.15,.177,.145],this.head);cap.position.y=.008;
    for(const sign of [-1,1]) {
      const eye=mesh(sphere,hair,[.012,.015,.01],this.head); eye.position.set(sign*.049,.012,.132);
      const ear=mesh(sphere,skin,[.027,.047,.024],this.head); ear.position.set(sign*.145,-.015,0);
    }
    for(let i=0;i<4;i++) {
      const foot=i>=2;
      this.limbs.push({upper:mesh(cylinder,gi,[1,1,1],this.root),lower:mesh(cylinder,gi,[1,1,1],this.root),joint:mesh(sphere,gi,foot?[.095,.095,.095]:[.072,.072,.072],this.root),tip:mesh(sphere,skin,foot?[.067,.055,.12]:[.061,.072,.047],this.root),cuff:mesh(cylinder,trim,[1,1,1],this.root),foot});
    }
  }
  pose(a:Pose,b:Pose,t:number,side0:number,shapes?:Obstacle[],owner=0,goals?:THREE.Vector3[],free:boolean[]=[]) {
    const h=v(a.h).lerp(v(b.h),t),q=orientation(a).slerp(orientation(b),t);
    this.body.position.copy(h); this.body.quaternion.copy(q);
    this.body.updateWorldMatrix(true,true);
    shapes??=obstacles([this.body]);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(q),up=yAxis.clone().applyQuaternion(q);
    for(let i=0;i<4;i++) {
      const limb=this.limbs[i],j=i%2,side=j===0?side0:-side0;
      const start=h.clone().addScaledVector(right,(limb.foot?.135:.205)*side).addScaledVector(up,limb.foot?0:.48);
      const targetsA=limb.foot?a.feet:a.hands,targetsB=limb.foot?b.feet:b.hands;
      const polesA=limb.foot?a.knees:a.elbows,polesB=limb.foot?b.knees:b.elbows;
      const target=v(targetsA[j]).lerp(v(targetsB[j]),t),pole=v(polesA[j]).lerp(v(polesB[j]),t);
      const solution=solveLimb(start,goals?.[i]??target,pole,q,shapes,owner,limb.foot,this.solutions[i],i,free[i]);
      this.solutions[i]=solution;
      const {joint,end}=solution;
      segment(limb.upper,start,joint,limb.foot?.094:.073);
      segment(limb.lower,joint,end,limb.foot?.076:.060);
      limb.joint.position.copy(joint); limb.tip.position.copy(end); limb.tip.quaternion.copy(solution.rotation);
      const cuffStart=end.clone().lerp(joint,.1);
      segment(limb.cuff,end,cuffStart,limb.foot?.078:.062);
    }
  }
  dispose() { this.root.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const ms=Array.isArray(object.material)?object.material:[object.material];ms.forEach(m=>m.dispose());}}); }
}

function applyMotion(players:[Grappler,Grappler],data:number[][][],progress:number){
  const f=THREE.MathUtils.clamp(progress,0,1)*(data.length-1),index=Math.min(data.length-2,Math.floor(f)),t=f-index;
  for(let person=0;person<2;person++){
    const a=data[index][person],b=data[index+1][person],g=players[person];
    const vec=(offset:number)=>new THREE.Vector3(a[offset],a[offset+1],a[offset+2]).lerp(new THREE.Vector3(b[offset],b[offset+1],b[offset+2]),t);
    const q=new THREE.Quaternion(a[3],a[4],a[5],a[6]).slerp(new THREE.Quaternion(b[3],b[4],b[5],b[6]),t);
    g.body.position.copy(vec(0));g.body.quaternion.copy(q);
    for(let i=0;i<4;i++){
      const offset=7+i*16,limb=g.limbs[i],start=vec(offset),end=vec(offset+6),guess=vec(offset+3),l1=limb.foot?.47:.36,l2=limb.foot?.46:.34;
      const axis=end.clone().sub(start),d=axis.length();axis.normalize();
      const along=(l1*l1-l2*l2+d*d)/(2*d),centre=start.clone().addScaledVector(axis,along),radius=Math.sqrt(Math.max(0,l1*l1-along*along));
      const bend=guess.clone().sub(centre).addScaledVector(axis,-guess.clone().sub(centre).dot(axis)).normalize();
      const joint=centre.clone().addScaledVector(bend,radius),shin=joint.clone().sub(end).normalize();
      const stored=new THREE.Quaternion(a[offset+9],a[offset+10],a[offset+11],a[offset+12]).slerp(new THREE.Quaternion(b[offset+9],b[offset+10],b[offset+11],b[offset+12]),t);
      const toe=new THREE.Vector3(0,0,1).applyQuaternion(stored);toe.addScaledVector(shin,-toe.dot(shin)).normalize();
      const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(shin.clone().cross(toe).normalize(),shin,toe));
      segment(limb.upper,start,joint,limb.foot?.094:.073);segment(limb.lower,joint,end,limb.foot?.076:.060);
      limb.joint.position.copy(joint);limb.tip.position.copy(end);limb.tip.quaternion.copy(rotation);
      segment(limb.cuff,end,end.clone().lerp(joint,.1),limb.foot?.078:.062);
      g.solutions[i]={start,joint,end,rotation,goal:vec(offset+13),clearance:0,basis:bend};
    }
  }
}

function currentPose(a:Pose,b:Pose,t:number):Pose {
  const q=orientation(a).slerp(orientation(b),t),blend=(x:V,y:V)=>v(x).lerp(v(y),t).toArray() as V;
  return {h:blend(a.h,b.h),u:new THREE.Vector3(0,1,0).applyQuaternion(q).toArray() as V,f:new THREE.Vector3(0,0,1).applyQuaternion(q).toArray() as V,hands:a.hands.map((x,i)=>blend(x,b.hands[i])) as [V,V],feet:a.feet.map((x,i)=>blend(x,b.feet[i])) as [V,V],elbows:a.elbows.map((x,i)=>blend(x,b.elbows[i])) as [V,V],knees:a.knees.map((x,i)=>blend(x,b.knees[i])) as [V,V]};
}
export function posePair(players:[Grappler,Grappler],a0:Pose,a1:Pose,b0:Pose,b1:Pose,t:number,sides:[number,number],key:string,progress:number) {
  if(useMotionData&&motionData[key]?.length){applyMotion(players,motionData[key],progress);return;}
  const poses=[currentPose(a0,a1,t),currentPose(b0,b1,t)];
  if(key==='triangle'||key==='omoplata'){
    const fade=1-THREE.MathUtils.smoothstep(progress,.25,.7);
    poses[0].h[0]+=.20*fade;poses[1].h[0]-=.15*fade;poses[1].h[1]-=.10*fade;
  }
  if(key==='bow')poses[0].h[0]+=.16*THREE.MathUtils.smoothstep(progress,.24,.5);
  if(key==='bow')poses[0].h[2]+=.15*THREE.MathUtils.smoothstep(progress,.35,.7);
  if(key==='omoplata')poses[0].h[0]+=.08*THREE.MathUtils.smoothstep(progress,.25,.5);
  if(key==='triangle')poses[0].h[0]+=.09*THREE.MathUtils.smoothstep(progress,.60,.8);
  if(key==='armbar')poses[1].h[2]+=.10*THREE.MathUtils.smoothstep(progress,.48,.8);
  if(key==='armbar'){
    const late=THREE.MathUtils.smoothstep(progress,.48,.8);
    poses[0].h[2]+=.22*late;poses[0].h[1]-=.17*late;
    poses[0].feet=poses[0].feet.map(p=>[p[0],p[1],p[2]+.22*late]) as [V,V];
  }
  for(let i=0;i<2;i++){players[i].body.position.copy(v(poses[i].h));players[i].body.quaternion.copy(orientation(poses[i]));players[i].body.updateWorldMatrix(true,true);}
  const shapes=obstacles(players.map(p=>p.body));
  const starts=players.map((g,i)=>[-1,1].map((_,j)=>new THREE.Vector3((j===0?sides[i]:-sides[i])*.205,.48,0).applyQuaternion(g.body.quaternion).add(g.body.position)));
  const goals=poses.map(p=>[...p.hands,...p.feet].map(v));
  if(key==='double'){
    // The partner frames on the shooter's shoulder, rather than reaching
    // through the head as the entry moves to the outside of the hip.
    const contact=THREE.MathUtils.smoothstep(progress,.13,.29)*(1-THREE.MathUtils.smoothstep(progress,.79,.94));
    const shoulder=new THREE.Vector3(.22,.35,-.18).applyQuaternion(players[0].body.quaternion).add(players[0].body.position);
    goals[1][0].lerp(outside(shoulder,shapes,.07),contact);
  }
  if(key==='triangle'){
    goals[0][2].y=Math.min(goals[0][2].y,poses[0].h[1]+.82);
    const raise=THREE.MathUtils.smoothstep(progress,.25,.32)*(1-THREE.MathUtils.smoothstep(progress,.70,.8));
    goals[0][3].y=Math.max(goals[0][3].y,1.10*raise);
    if(progress>.25&&progress<.7)goals[0][3].z=-.35+.67*THREE.MathUtils.smoothstep(progress,.46,.65);
  }
  if(key==='triangle'||key==='armbar'||key==='omoplata'){
    const hand=key==='omoplata'?1:0;
    const preferred=goals[0][hand].clone().add(goals[1][0]).multiplyScalar(.5);
    if(key==='armbar')preferred.y+=.055*THREE.MathUtils.smoothstep(progress,.48,.8);
    const required=key==='armbar'?[starts[0][0],starts[0][1],starts[1][0]]:[starts[0][hand],starts[1][0]];
    const anchor=sharedAnchor(preferred,required,shapes);
    goals[1][0]=anchor.clone();
    const offset=starts[0][hand].clone().sub(anchor).normalize().multiplyScalar(.11);
    goals[0][hand]=anchor.clone().add(offset);
    if(key==='armbar'){
      const gripSide=new THREE.Vector3(1,0,0).applyQuaternion(players[0].body.quaternion).multiplyScalar(.11);
      goals[0][0]=anchor.clone().add(gripSide);goals[0][1]=anchor.clone().sub(gripSide);
    }
    if(key==='triangle'){
      const collar=new THREE.Vector3(-.23,.42,.02).applyQuaternion(players[1].body.quaternion).add(players[1].body.position);
      const other=sharedAnchor(goals[1][1],[starts[0][1],starts[1][1]],shapes);
      goals[1][1]=other;goals[0][1]=other.clone().add(starts[0][1].clone().sub(other).normalize().multiplyScalar(.11)).lerp(collar,THREE.MathUtils.smoothstep(progress,.60,.8));
    }
    if(key==='omoplata'){
      const waist=new THREE.Vector3(.06,.16,-.20).applyQuaternion(players[1].body.quaternion).add(players[1].body.position);
      const other=sharedAnchor(goals[1][1],[starts[0][0],starts[1][1]],shapes);
      goals[1][1]=other;
      goals[0][0]=other.clone().add(starts[0][0].clone().sub(other).normalize().multiplyScalar(.11)).lerp(waist,THREE.MathUtils.smoothstep(progress,.65,.79));
      const release=THREE.MathUtils.smoothstep(progress,.25,.35)*(1-THREE.MathUtils.smoothstep(progress,.68,.79));
      const support=starts[0][1].clone().addScaledVector(new THREE.Vector3(0,0,1).applyQuaternion(players[0].body.quaternion),.20);support.y=.075;
      goals[0][1].lerp(support,release);
      const around=THREE.MathUtils.smoothstep(progress,.65,.79);goals[0][1].addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(players[0].body.quaternion),.25*Math.sin(Math.PI*around));
    }
  }
  if(key==='bow'){
    const collar=new THREE.Vector3(.23,.43,.02).applyQuaternion(players[1].body.quaternion).add(players[1].body.position);
    const pants=new THREE.Vector3(-.18,.04,.04).applyQuaternion(players[1].body.quaternion).add(players[1].body.position);
    goals[0][0]=outside(collar,shapes,.065);
    const nearCollar=new THREE.Vector3(-.23,.43,.02).applyQuaternion(players[1].body.quaternion).add(players[1].body.position);
    goals[0][1]=nearCollar.lerp(pants,THREE.MathUtils.smoothstep(progress,.24,.36));
    goals[0][3].lerp(new THREE.Vector3(-.10,.78,-.20),THREE.MathUtils.smoothstep(progress,.4,.7));
  }
  for(let person=0;person<2;person++)for(let i=2;i<4;i++){
    const start=new THREE.Vector3((i===2?sides[person]:-sides[person])*.135,0,0).applyQuaternion(players[person].body.quaternion).add(players[person].body.position);
    const delta=goals[person][i].clone().sub(start);if(delta.length()>.90)goals[person][i]=start.add(delta.setLength(.90));
  }
  players[0].pose(poses[0],poses[0],0,sides[0],shapes,0,goals[0],[false,key==='omoplata'&&progress>.25&&progress<.79]);
  players[1].pose(poses[1],poses[1],0,sides[1],shapes,1,goals[1],[key==='bow',key==='bow']);
}

export function mountBjjWidget(widget:HTMLElement) {
  const canvas=widget.querySelector<HTMLCanvasElement>('canvas')!;
  let renderer:THREE.WebGLRenderer|undefined;
  try {renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});}
  catch {widget.querySelector<HTMLElement>('.bjj-fallback')!.hidden=false;return;}
  if(renderer){renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.setClearColor(0xcedee4);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;}
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0x657b87,2.3));
  const light=new THREE.DirectionalLight(0xfff6e5,3);light.position.set(-3,6,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  light.shadow.camera.left=-3;light.shadow.camera.right=3;light.shadow.camera.top=3;light.shadow.camera.bottom=-3;light.shadow.normalBias=.025;scene.add(light);
  const mat=mesh(new THREE.BoxGeometry(4.8,.06,3.7),material(0x7895a6),[1,1,1],scene);mat.position.y=-.045;mat.castShadow=false;
  const grid=new THREE.GridHelper(4.8,8,0xb3c8d2,0x93afbd);grid.position.y=-.008;grid.scale.z=3.7/4.8;scene.add(grid);
  const floor=mesh(new THREE.PlaneGeometry(200,200),material(0xcedee4),[1,1,1],scene);floor.rotation.x=-Math.PI/2;floor.position.y=-.079;floor.castShadow=false;
  const camera=new THREE.OrthographicCamera(-3,3,2,-2,.1,100);
  const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableZoom=false;controls.enableDamping=true;controls.dampingFactor=.12;controls.minPolarAngle=.15;controls.maxPolarAngle=Math.PI*.48;controls.target.set(0,.65,0);
  // A = white attacker, B = blue partner. Anatomical side identity is retained
  // throughout each clip, including the armbar's perpendicular turn.
  // Identical unscaled rigs and orthographic projection preserve both body sizes.
  const a=new Grappler(scene,0xf2efe5,0x7c648b),b=new Grappler(scene,0x366d9c,0xe8e0cf);
  const sides:Record<string,[number,number]>={double:[1,1],triangle:[-1,1],armbar:[1,-1],omoplata:[-1,1],bow:[1,1]};
  const toggle=widget.querySelector<HTMLButtonElement>('.bjj-toggle')!,timeline=widget.querySelector<HTMLInputElement>('.bjj-timeline')!,speedInput=widget.querySelector<HTMLSelectElement>('.bjj-speed')!;
  const phase=widget.querySelector<HTMLElement>('[data-phase]')!,name=widget.querySelector<HTMLElement>('[data-tech-name]')!;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let key='double',progress=0,playing=!reduced.matches,visible=true,raf=0,previous=0,destroyed=false;
  const syncPlay=()=>{toggle.textContent=playing?'일시정지':progress>=1?'다시 재생':'재생';toggle.setAttribute('aria-label',playing?'애니메이션 일시정지':'애니메이션 재생');};
  const resetView=()=>{camera.position.set(...techniques[key].camera);controls.target.set(key==='double'?.3:0,key==='double'?.75:.5,0);controls.update();};
  const resize=()=>{const {width,height}=canvas.parentElement!.getBoundingClientRect();if(!width||!height)return;renderer?.setSize(width,height,false);const aspect=width/height;const half=aspect<1.3?1.75:1.45;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();schedule();};
  const draw=(time:number)=>{
    raf=0;if(destroyed)return;
    const delta=previous?Math.min((time-previous)/1000,.08):0;previous=time;
    const duration=techniques[key].duration??16;
    if(playing){progress=Math.min(1,progress+delta/duration*Number(speedInput.value));if(progress>=1){playing=false;syncPlay();}}
    const tech=techniques[key],frames=tech.frames;
    let index=0;while(index<frames.length-2 && progress>=frames[index+1].t)index++;
    const first=frames[index],next=frames[index+1];
    const fraction=THREE.MathUtils.clamp((progress-first.t)/(next.t-first.t),0,1);
    const eased=fraction*fraction*(3-2*fraction);
    posePair([a,b],first.a,next.a,first.b,next.b,eased,sides[key],key,progress);
    const active=progress>=next.t?next:first;
    phase.textContent=active.label;
    timeline.value=String(Math.round(progress*1000));
    timeline.setAttribute('aria-valuetext',`${tech.korean}, ${active.label}, ${Math.round(progress*100)}%`);
    controls.update();renderer?.render(scene,camera);
    if(visible&&!document.hidden)raf=requestAnimationFrame(draw);
  };
  const schedule=()=>{if(!raf&&visible&&!document.hidden&&!destroyed){previous=0;raf=requestAnimationFrame(draw);}};
  const onToggle=()=>{if(progress>=1){progress=0;timeline.value='0';}playing=!playing;syncPlay();schedule();};
  toggle.addEventListener('click',onToggle);
  widget.querySelector('.bjj-restart')!.addEventListener('click',()=>{progress=0;timeline.value='0';syncPlay();schedule();});
  timeline.addEventListener('input',()=>{playing=false;progress=Number(timeline.value)/1000;syncPlay();schedule();});
  widget.querySelectorAll<HTMLButtonElement>('[data-technique]').forEach(button=>button.addEventListener('click',()=>{
    key=button.dataset.technique!;progress=0;playing=!reduced.matches;
    timeline.value='0';phase.textContent=techniques[key].frames[0].label;
    widget.querySelectorAll<HTMLButtonElement>('[data-technique]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    widget.querySelectorAll<HTMLElement>('[data-reference-technique]').forEach(group=>{group.hidden=group.dataset.referenceTechnique!==key;});
    name.textContent=techniques[key].name;widget.querySelector('[data-tech-description]')!.textContent=techniques[key].description;
    canvas.setAttribute('aria-label',`${techniques[key].korean} 3D 시연. 드래그해서 시점을 회전할 수 있습니다.`);
    resize();resetView();syncPlay();schedule();
  }));
  widget.querySelector('.bjj-view')!.addEventListener('click',()=>{resetView();schedule();});
  const onMotion=()=>{if(reduced.matches){playing=false;syncPlay();}};reduced.addEventListener('change',onMotion);
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(!visible&&raf){cancelAnimationFrame(raf);raf=0;}else schedule();});observer.observe(widget);
  const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(canvas.parentElement!);
  const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else schedule();};document.addEventListener('visibilitychange',onVisibility);
  const cleanup=()=>{destroyed=true;cancelAnimationFrame(raf);observer.disconnect();sizeObserver.disconnect();reduced.removeEventListener('change',onMotion);document.removeEventListener('visibilitychange',onVisibility);controls.dispose();scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const ms=Array.isArray(object.material)?object.material:[object.material];ms.forEach(m=>m.dispose());}});renderer?.dispose();};
  window.addEventListener('pagehide',event=>{if(!event.persisted)cleanup();},{once:true});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();playing=false;syncPlay();widget.querySelector<HTMLElement>('.bjj-fallback')!.hidden=false;});
  resetView();resize();syncPlay();schedule();
}
