import {referenceKeys,referenceMeta} from './reference-double-data';
export {referenceMeta};
type Point=[number,number];
export type ReferencePose={a:Point[];b:Point[];zoom:number;ground:number;inferredA:number[];inferredB:number[];frame:number};
export function sampleReference(frame:number):ReferencePose {
  frame=Math.max(0,Math.min(110,frame));let i=0;while(i<referenceKeys.length-2&&referenceKeys[i+1].f<=frame)i++;
  const first=referenceKeys[i],next=referenceKeys[i+1],t=(frame-first.f)/(next.f-first.f);
  const mix=(a:number,b:number)=>a+(b-a)*t;
  const joints=(id:'a'|'b')=>first[id].map((p,j)=>[mix(p[0],next[id][j][0]),mix(p[1],next[id][j][1])] as Point);
  return {a:joints('a'),b:joints('b'),zoom:mix(first.z,next.z),ground:mix(first.g,next.g),inferredA:[...new Set([...first.hiddenA,...next.hiddenA])],inferredB:[...new Set([...first.hiddenB,...next.hiddenB])],frame};
}
export function referencePhase(frame:number) {
  if(frame<49)return '01 · 상체 타이 · 타이밍 잡기';
  if(frame<60)return '02 · 팔 아래로 레벨 체인지';
  if(frame<76)return '03 · 무릎을 낮춰 양다리 감싸기';
  if(frame<97)return '04 · 밀착 · 일어서며 방향 전환';
  return '05 · 착지 · 탑으로 따라가기';
}
const midpoint=(a:Point,b:Point):Point=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
// A 2D articulated rig: the same 14-bone hierarchy is used for every frame.
// Bone endpoints preserve image-space contacts; depth is deliberately not invented.
function drawPerson(ctx:CanvasRenderingContext2D,j:Point[],attacker:boolean,pass:'far'|'body'|'near'|'far-leg'|'far-arm'|'near-leg'|'near-arm') {
  const cloth=attacker?'#f4efe2':'#396d93',edge=attacker?'#84949a':'#20455f',skin='#cda186',hair='#263c48',trim=attacker?'#c6ced0':'#afc6d5';
  const lengths=[[1,2],[2,3],[4,5],[5,6],[7,8],[8,9],[10,11],[11,12]].map(([a,b])=>Math.hypot(j[a][0]-j[b][0],j[a][1]-j[b][1])).sort((a,b)=>a-b);
  const thickness=Math.max(.75,Math.min(1.15,Math.sqrt((lengths[3]+lengths[4])/140)));
  const line=(a:Point,b:Point,width:number,color:string,outline=true)=>{ctx.lineCap='round';ctx.lineJoin='round';if(outline){ctx.strokeStyle=edge;ctx.lineWidth=width+3;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();};
  const circle=(p:Point,r:number,color:string)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.fill();};
  const limb=(start:number,middle:number,end:number,leg:boolean)=>{line(j[start],j[middle],(leg?32:24)*thickness,cloth);line(j[middle],j[end],(leg?25:20)*thickness,cloth);circle(j[middle],(leg?16:12)*thickness,cloth);const cuff:Point=[j[end][0]*.92+j[middle][0]*.08,j[end][1]*.92+j[middle][1]*.08];line(cuff,j[end],(leg?26:21)*thickness,trim,false);circle(j[end],(leg?9:8)*thickness,skin);if(leg){const dx=j[middle][0]-j[end][0],dy=j[middle][1]-j[end][1],length=Math.hypot(dx,dy)||1,side=attacker?-1:1;line(j[end],[j[end][0]-dy/length*side*22*thickness,j[end][1]+dx/length*side*22*thickness],13*thickness,skin,false);}};
  const hip=midpoint(j[7],j[10]),shoulder=midpoint(j[1],j[4]);
  if(pass==='far'){limb(10,11,12,true);limb(4,5,6,false);return;}
  if(pass==='near'){limb(7,8,9,true);limb(1,2,3,false);return;}
  if(pass==='far-leg'){limb(10,11,12,true);return;}if(pass==='far-arm'){limb(4,5,6,false);return;}
  if(pass==='near-leg'){limb(7,8,9,true);return;}if(pass==='near-arm'){limb(1,2,3,false);return;}
  const spine:Point=[shoulder[0]-hip[0],shoulder[1]-hip[1]],len=Math.hypot(...spine)||1,up:Point=[spine[0]/len,spine[1]/len],side:Point=[-up[1],up[0]];
  const corner=(center:Point,lateral:number,vertical=0):Point=>[center[0]+side[0]*lateral*thickness+up[0]*vertical,center[1]+side[1]*lateral*thickness+up[1]*vertical];
  ctx.fillStyle=cloth;ctx.strokeStyle=edge;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.beginPath();
  ctx.moveTo(...corner(shoulder,28));ctx.quadraticCurveTo(...corner(shoulder,34,-25),...corner(hip,25,-7));ctx.lineTo(...corner(hip,-25,-7));ctx.quadraticCurveTo(...corner(shoulder,-34,-25),...corner(shoulder,-28));ctx.quadraticCurveTo(...corner(shoulder,0,9),...corner(shoulder,28));ctx.closePath();ctx.fill();ctx.stroke();
  line(j[7],j[10],32*thickness,cloth);
  const lapelTop:Point=[shoulder[0]+up[0]*3,shoulder[1]+up[1]*3],lapelBottom:Point=[hip[0]+up[0]*18,hip[1]+up[1]*18];
  for(const sign of [-1,1])line([lapelTop[0]+side[0]*sign*10,lapelTop[1]+side[1]*sign*10],[lapelBottom[0]-side[0]*sign*5,lapelBottom[1]-side[1]*sign*5],4,trim,false);
  line([hip[0]-side[0]*22,hip[1]-side[1]*22],[hip[0]+side[0]*22,hip[1]+side[1]*22],7,attacker?'#826b93':'#eee5ce',false);
  line(shoulder,j[0],15*thickness,skin,false);circle(j[0],22*thickness,skin);
  ctx.save();ctx.translate(...j[0]);ctx.rotate(Math.atan2(up[1],up[0])+Math.PI/2);ctx.fillStyle=hair;ctx.beginPath();ctx.arc(0,-1,22*thickness,Math.PI,2*Math.PI);ctx.fill();ctx.restore();
}
export function drawReferenceDouble(ctx:CanvasRenderingContext2D,width:number,height:number,frame:number) {
  const pose=sampleReference(frame),center=(pose.a[7][0]+pose.a[10][0]+pose.b[7][0]+pose.b[10][0])/4;
  const scale=Math.min((height-62)/460,width/540),floor=height-38;
  ctx.clearRect(0,0,width,height);ctx.fillStyle='#d3e0e5';ctx.fillRect(0,0,width,height);
  const matWidth=Math.min(width*.92,800),back=height*.52;
  ctx.fillStyle='#839fab';ctx.beginPath();ctx.moveTo(width/2-matWidth*.4,back);ctx.lineTo(width/2+matWidth*.4,back);ctx.lineTo(width/2+matWidth*.5,floor+24);ctx.lineTo(width/2-matWidth*.5,floor+24);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#b5c9d2';ctx.lineWidth=1;for(let k=-3;k<=3;k++){ctx.beginPath();ctx.moveTo(width/2+k*matWidth*.1,back);ctx.lineTo(width/2+k*matWidth*.13,floor+24);ctx.stroke();}for(let k=1;k<4;k++){const y=back+(floor+24-back)*k/4;ctx.beginPath();ctx.moveTo(width/2-matWidth*(.4+.1*k/4),y);ctx.lineTo(width/2+matWidth*(.4+.1*k/4),y);ctx.stroke();}
  const convert=(j:Point[])=>j.map(([x,y])=>[(x-center)/pose.zoom,(y-pose.ground)/pose.zoom] as Point);
  const a=convert(pose.a),b=convert(pose.b);
  ctx.save();ctx.translate(width/2,floor);ctx.scale(scale,scale);
  const shadow=(point:Point,wide=20)=>{ctx.save();ctx.translate(point[0],point[1]+15);ctx.scale(wide,5);const gradient=ctx.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,'#142d3d50');gradient.addColorStop(1,'#142d3d00');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();};
  if(frame<78){shadow(b[9]);shadow(b[12]);}
  if(frame>=65&&frame<75){shadow(a[8],26);shadow(a[12]);}else{shadow(a[9]);shadow(a[12]);}
  if(frame>=100)shadow(midpoint(b[7],b[10]),48);
  if(frame>=97){
    for(const[j,isA]of [[b,false],[a,true]] as const)for(const pass of ['far','body','near'] as const)drawPerson(ctx,j as Point[],isA,pass);
  }else if(frame>=61){
    for(const[j,isA]of [[b,false],[a,true]] as const)drawPerson(ctx,j as Point[],isA,'far');
    drawPerson(ctx,b,false,'body');drawPerson(ctx,a,true,'body');
    for(const pass of ['near-leg','near-arm'] as const){drawPerson(ctx,b,false,pass);drawPerson(ctx,a,true,pass);}
  }else{
    for(const pass of ['far','body','near'] as const){drawPerson(ctx,a,true,pass);drawPerson(ctx,b,false,pass);}
  }
  ctx.restore();
}
