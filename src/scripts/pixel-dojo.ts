import { techniques, type V, type Pose } from './bjj-poses';

type Pair = { a: Pose; b: Pose };
type Clip = { korean: string; frames: (Pair & { t: number })[] };
const standing = techniques.double.frames[0];
const guard = techniques.triangle.frames[0];
const point = (a:V,b:V,t:number):V => a.map((v,i)=>v+(b[i]-v)*t) as V;
function blend(a:Pose,b:Pose,t:number):Pose {
  const limbs = (k:'hands'|'feet'|'knees'|'elbows') => [point(a[k][0],b[k][0],t),point(a[k][1],b[k][1],t)] as [V,V];
  return {h:point(a.h,b.h,t),u:point(a.u,b.u,t),f:point(a.f,b.f,t),hands:limbs('hands'),feet:limbs('feet'),knees:limbs('knees'),elbows:limbs('elbows')};
}
function shift(p:Pose,x:number,y=0):Pose {
  const move=(v:V):V=>[v[0]+x,v[1]+y,v[2]];
  const both=(vs:[V,V]):[V,V]=>[move(vs[0]),move(vs[1])];
  return {...p,h:move(p.h),hands:both(p.hands),feet:both(p.feet),elbows:both(p.elbows),knees:both(p.knees)};
}
const sit:Pose={...shift(standing.a,.16), h:[-.69,.30,0],u:[-.32,.94,0],hands:[[-1.05,.10,-.3],[-.25,.79,.2]],elbows:[[-.99,.5,-.24],[-.61,.68,.3]],feet:[[-.68,.08,-.3],[.05,.08,.28]],knees:[[-.47,.54,-.35],[-.27,.24,.3]]};
const lift:Pose={...sit,h:[-.78,.55,0],knees:[[-.62,.56,-.3],[-.83,.29,.25]],feet:[[-.52,.08,-.28],[-1.16,.14,.24]]};
const sprawl:Pose={...standing.b,h:[.72,.54,0],u:[-.84,.53,0],feet:[[1.52,.08,.27],[1.64,.1,-.2]],knees:[[1.18,.29,.34],[1.15,.36,-.26]],hands:[[-.24,.62,.21],[-.3,.58,-.25]],elbows:[[-.05,.81,.28],[.05,.83,-.3]]};
const sequence=(korean:string,pairs:Pair[]):Clip=>({korean,frames:pairs.map((p,i)=>({...p,t:i/(pairs.length-1)}))});
const clips:Clip[]=[...Object.values(techniques),
  sequence('가드 풀',[standing,{a:{...sit,feet:[sit.feet[0],[.42,.84,.19]]},b:standing.b},guard]),
  sequence('스프롤',[standing,techniques.double.frames[2],{a:techniques.double.frames[2].a,b:sprawl}]),
  sequence('테크니컬 스탠드업',[{a:sit,b:standing.b},{a:lift,b:standing.b},{a:shift(standing.a,-.30),b:standing.b}])];

type XY=[number,number];
const proj=(v:V):XY=>[Math.round(53+v[0]*22-v[2]*9), Math.round(64-v[1]*25+v[2]*9)];
// Stamp square pixels along each bone so diagonal edges stay crisp at any display size.
function paint(ctx:CanvasRenderingContext2D,p:Pose,blue:boolean,blink:boolean) {
  const ink='#393044', coat=blue?'#659bd9':'#fff7df', shade=blue?'#4977ab':'#d6c9ab',fur=blue?'#e8a161':'#ffe5be';
  const rect=(x:number,y:number,w:number,h:number,c:string)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h)};
  const bone=(a:XY,b:XY,w:number,c:string)=>{
    const n=Math.max(1,Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]));
    for(let i=0;i<=n;i++)rect(Math.round(a[0]+(b[0]-a[0])*i/n)-(w>>1),Math.round(a[1]+(b[1]-a[1])*i/n)-(w>>1),w,w,c);
  };
  const along=(d:number):V=>p.h.map((v,i)=>v+p.u[i]*d) as V;
  const hip=proj(p.h), chest=proj(along(.48)), head=proj(along(.88));
  function limb(arm:boolean,i:0|1) {
    const a=arm?chest:hip,b=proj((arm?p.elbows:p.knees)[i]),c=proj((arm?p.hands:p.feet)[i]);
    for(const [w,col] of [[6,ink],[4,i?coat:shade]] as const){bone(a,b,w,col);bone(b,c,w,col)}
    rect(c[0]-2,c[1]-1,4,3,fur);
  }
  limb(false,0);limb(true,0);limb(false,1);
  bone(hip,chest,11,ink);bone(hip,chest,9,coat);bone(chest,proj(along(.24)),3,shade);
  rect(hip[0]-5,hip[1]-2,11,3,blue?'#ffe29c':'#9a76ab');
  const [x,y]=head;
  // A stepped silhouette, two triangular ears, blush and a tiny muzzle.
  for(const s of [-1,1]){const e=x+(s<0?-8:3);rect(e,y-9,5,6,ink);rect(e+1,y-8,3,4,'#ecaaa3')}
  rect(x-6,y-7,12,15,ink);rect(x-9,y-5,18,11,ink);
  rect(x-8,y-4,16,9,fur);rect(x-5,y-6,10,13,fur);
  if(blue){rect(x-3,y-6,2,3,'#ae664a');rect(x+1,y-6,2,2,'#ae664a')}
  const f=p.f[0]<0?-1:1;
  for(const d of [-3,3])rect(x+d+f,y-1,2,blink?1:3,ink);
  rect(x-6+f,y+2,2,1,'#db9287');rect(x+5+f,y+2,2,1,'#db9287');rect(x+f,y+2,2,1,ink);
  limb(true,1);
}

export function startDojo(){
  const box=document.querySelector<HTMLElement>('.mat-pair')!, controls=document.querySelector<HTMLElement>('.mat-controls')!;
  const ctx=box.querySelector('canvas')!.getContext('2d'); if(!ctx)return;
  const label=box.querySelector('span')!,button=controls.querySelector('button')!,state=button.querySelector('span')!;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let enabled=!reduced.matches, timer=0,time=0,last=0,walk=true,bag:Clip[]=[],clip:Clip|undefined;
  let x=.72,y=.75,toX=.56,toY=.69;
  function next(){
    if(!bag.length){
      bag=[...clips];for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}
      if(bag.at(-1)===clip) [bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];
    }
    return bag.pop()!;
  }
  function draw(now:number){
    time+=last?Math.min(now-last,160):0;last=now;
    const duration=walk?3600:6000;
    const t=Math.min(time/duration,1), ease=t*t*(3-2*t);
    const px=(walk?x+(toX-x)*ease:x)*Math.max(0,innerWidth-box.offsetWidth);
    const py=(walk?y+(toY-y)*ease:y)*Math.max(0,innerHeight-box.offsetHeight-8);
    box.style.transform='translate('+Math.round(px)+'px,'+Math.round(py)+'px)';
    ctx!.clearRect(0,0,112,76);
    ctx!.fillStyle='#45415329';ctx!.fillRect(26,65,56,2);ctx!.fillRect(30,67,48,1);
    let a:Pose,b:Pose;
    if(walk){
      label.textContent='도장 산책 중';const step=Math.sin(time/125);
      const stride=(p:Pose,s:number)=>{const q=shift(p,0,Math.abs(s)*.045);q.feet.forEach((v,i)=>{v[0]+=s*(i?1:-1)*.13;v[1]+=Math.max(0,s*(i?1:-1))*.1});return q};
      a=stride(standing.a,step);b=stride(standing.b,-step);
    }else{
      label.textContent=clip!.korean;
      const fs=clip!.frames,phase=Math.max(0,Math.min(1,(t-.10)/.75));
      const i=fs.findIndex((f)=>f.t>=phase),end=fs[i<0?fs.length-1:i],start=fs[Math.max(0,(i<0?fs.length-1:i)-1)];
      const u=Math.min(1,(phase-start.t)/(end.t-start.t||1));
      a=blend(start.a,end.a,u);b=blend(start.b,end.b,u);
      const settle=t<.10?1-t/.10:Math.max(0,(t-.91)/.09);
      if(settle){a=blend(a,standing.a,settle);b=blend(b,standing.b,settle)}
    }
    paint(ctx!,b,true,time%3400<120);paint(ctx!,a,false,(time+400)%3000<120);
    if(t===1){time=0;if(walk){x=toX;y=toY;clip=next()}else{toX=x>.5?.02+Math.random()*.32:.64+Math.random()*.32;toY=.35+Math.random()*.55}walk=!walk}
    timer=window.setTimeout(()=>draw(performance.now()),65);
  }
  function refresh(){
    clearTimeout(timer);last=0;box.hidden=!enabled;
    state.textContent=enabled?'켜짐':'꺼짐';button.setAttribute('aria-pressed',String(enabled));
    if(enabled&&!document.hidden)draw(performance.now());
  }
  button.onclick=()=>{enabled=!enabled;refresh()};
  reduced.addEventListener('change',()=>{enabled=!reduced.matches;refresh()});
  document.addEventListener('visibilitychange',refresh);
  controls.hidden=false;refresh();
}
