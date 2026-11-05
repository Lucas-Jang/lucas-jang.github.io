import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {trianglePhase} from './bjj-triangle-clip';

type ReferencePlayer={seekTo:(time:number,allowSeekAhead:boolean)=>void;playVideo:()=>void;pauseVideo:()=>void;mute:()=>void;destroy:()=>void};
type ReferenceAPI={Player:new(element:string,options:Record<string,unknown>)=>ReferencePlayer};
type YouTubeWindow=Window & {YT?:ReferenceAPI;onYouTubeIframeAPIReady?:()=>void};

export function seekStudyTime(mixer:T.AnimationMixer,actions:T.AnimationAction[],time:number){
  for(const action of actions){action.enabled=true;action.paused=false;}
  mixer.setTime(T.MathUtils.clamp(time,0,22));
}

export async function mountTriangleStudy(root:HTMLElement){
  const canvas=root.querySelector<HTMLCanvasElement>('canvas')!,status=root.querySelector<HTMLElement>('[data-status]')!;
  const play=root.querySelector<HTMLButtonElement>('[data-play]')!,restart=root.querySelector<HTMLButtonElement>('[data-restart]')!;
  const slider=root.querySelector<HTMLInputElement>('[data-time]')!,clock=root.querySelector<HTMLOutputElement>('[data-clock]')!;
  const speed=root.querySelector<HTMLSelectElement>('[data-speed]')!,phase=root.querySelector<HTMLElement>('[data-phase]')!;
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({canvas,antialias:true});}catch{status.textContent='3D 화면을 표시할 수 없습니다. WebGL을 지원하는 브라우저에서 열어 주세요.';return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xc5d1d5);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-2,2,1.25,-1.25,.03,100);
  scene.add(new T.HemisphereLight(0xffffff,0x596b73,2.2));
  const light=new T.DirectionalLight(0xfff4e6,3);light.position.set(-3,6,4);light.castShadow=true;
  light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-2,right:2,top:2,bottom:-2});light.shadow.normalBias=.008;scene.add(light);
  const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x9aadb5,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;scene.add(floor);
  const grid=new T.GridHelper(4,16,0x78939f,0xb0c0c6);grid.position.y=-.006;scene.add(grid);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.target.set(-.2,.48,0);controls.minZoom=.65;controls.maxZoom=3.5;controls.minPolarAngle=.02;controls.maxPolarAngle=Math.PI*.49;
  const views:Record<string,[number,number,number]>={front:[-2.5,2.5,3],side:[2.8,1.3,0],back:[2.5,2,-3],top:[-.2,4,.001]};
  const view=(key:string)=>{camera.position.set(...views[key]);camera.zoom=1;camera.updateProjectionMatrix();controls.target.set(-.2,.48,0);controls.update();};view('front');
  const resize=()=>{const r=canvas.parentElement!.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);const half=1.25;camera.left=-half*r.width/r.height;camera.right=-camera.left;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();};
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas.parentElement!);resize();
  let stopped=false,raf=0,time=0,previous=0,playing=false,mixer:T.AnimationMixer|undefined,reference:ReferencePlayer|undefined;
  let actions:T.AnimationAction[]=[],helpers:T.SkeletonHelper[]=[];
  const sync=()=>{play.textContent=playing?'일시정지':time>=22?'다시 재생':'재생';slider.value=String(time);clock.value=`${time.toFixed(1)} / 22.0초`;phase.textContent=trianglePhase(time);slider.setAttribute('aria-valuetext',`${time.toFixed(1)}초, ${phase.textContent}`);};
  const seek=(value:number)=>{time=T.MathUtils.clamp(value,0,22);if(mixer)seekStudyTime(mixer,actions,time);sync();};
  const draw=(now:number)=>{if(stopped)return;const dt=previous?Math.min((now-previous)/1000,.1):0;previous=now;if(playing){seek(time+dt*Number(speed.value));if(time>=22){playing=false;reference?.pauseVideo();sync();}}controls.update();renderer.render(scene,camera);if(!document.hidden)raf=requestAnimationFrame(draw);};
  raf=requestAnimationFrame(draw);
  play.addEventListener('click',()=>{if(time>=22)seek(0);playing=!playing;sync();});
  restart.addEventListener('click',()=>{playing=false;seek(0);reference?.pauseVideo();});
  slider.addEventListener('input',()=>{playing=false;seek(Number(slider.value));reference?.pauseVideo();});
  root.querySelectorAll<HTMLButtonElement>('[data-seek]').forEach(button=>button.addEventListener('click',()=>{playing=false;seek(Number(button.dataset.seek));}));
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>view(button.dataset.view!)));
  root.querySelector<HTMLInputElement>('[data-skeleton]')!.addEventListener('change',event=>{for(const helper of helpers)helper.visible=(event.target as HTMLInputElement).checked;});
  const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(raf);playing=false;reference?.pauseVideo();sync();}else{previous=0;raf=requestAnimationFrame(draw);}};document.addEventListener('visibilitychange',onVisibility);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();playing=false;sync();status.hidden=false;status.textContent='3D 연결이 중단되었습니다. 페이지를 새로고침해 주세요.';});
  const cleanup=()=>{stopped=true;cancelAnimationFrame(raf);resizeObserver.disconnect();document.removeEventListener('visibilitychange',onVisibility);reference?.destroy();controls.dispose();mixer?.stopAllAction();scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}if(o instanceof T.SkinnedMesh)o.skeleton.dispose();});for(const h of helpers)h.dispose();renderer.dispose();};
  window.addEventListener('pagehide',event=>{if(!event.persisted)cleanup();},{once:true});
  try{
    const model=await new GLTFLoader().loadAsync(root.dataset.model!);if(stopped){model.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});return;}
    model.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}if(o instanceof T.SkinnedMesh){o.frustumCulled=false;const helper=new T.SkeletonHelper(o);helper.visible=false;scene.add(helper);helpers.push(helper);}});
    scene.add(model.scene);mixer=new T.AnimationMixer(model.scene);actions=model.animations.map(clip=>{const action=mixer!.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();return action;});
    if(!actions.length)throw new Error('No animation clips');status.hidden=true;play.disabled=false;restart.disabled=false;slider.disabled=false;seek(0);
  }catch(error){console.error(error);status.textContent='모델을 불러오지 못했습니다. 페이지를 새로고침해 주세요.';}
  root.querySelector<HTMLButtonElement>('[data-load-reference]')!.addEventListener('click',event=>{
    const button=event.currentTarget as HTMLButtonElement;button.disabled=true;button.textContent='시연을 불러오는 중…';
    const refStatus=root.querySelector<HTMLElement>('[data-reference-status]')!;
    const create=()=>{const api=(window as YouTubeWindow).YT;if(!api)return;reference=new api.Player('bjj-study-reference',{videoId:'Nr1m9eOBrks',host:'https://www.youtube-nocookie.com',playerVars:{playsinline:1,rel:0,origin:location.origin},events:{onReady:()=>{button.hidden=true;refStatus.textContent='원본은 자체 재생 버튼으로 조작합니다. 단계와 자세를 나란히 비교해 주세요.';},onError:()=>{button.hidden=true;refStatus.textContent='유튜브 재생을 사용할 수 없습니다. 아래 링크로 원본을 열어 주세요.';}}});};
    if((window as YouTubeWindow).YT)create();else{(window as YouTubeWindow).onYouTubeIframeAPIReady=create;const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{button.disabled=false;button.textContent='다시 불러오기';};document.head.append(script);}
  });
}
