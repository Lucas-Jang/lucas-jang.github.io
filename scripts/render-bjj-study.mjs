// Headless geometry review: renders the actual rig and baked animation without a browser.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import sharp from 'sharp';
class SvgElement {
 constructor(tag){this.tag=tag;this.attrs={};this.style={};this.childNodes=[];}
 setAttribute(k,v){this.attrs[k]=v;}
 appendChild(n){this.childNodes.push(n);}
 removeChild(n){this.childNodes.splice(this.childNodes.indexOf(n),1);}
 get outerHTML(){return `<${this.tag} ${Object.entries(this.attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}>${this.childNodes.map(n=>n.outerHTML).join('')}</${this.tag}>`;}
}
globalThis.document={createElementNS:(_,tag)=>new SvgElement(tag)};
const require=createRequire(import.meta.url);
const source=await fs.readFile(new URL('../src/scripts/bjj-widget.ts',import.meta.url),'utf8');
await build({stdin:{contents:source+"\nimport {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';export {Grappler,THREE,techniques,SVGRenderer};",resolveDir:fileURLToPath(new URL('../src/scripts/',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:'.astro/bjj-study.cjs',logLevel:'silent'});
const {Grappler,THREE:T,techniques,posePair,SVGRenderer}=require('../.astro/bjj-study.cjs');
const out=process.argv[2]??'../outputs/bjj-motion-study';await fs.mkdir(out,{recursive:true});
const sides={double:[1,1],triangle:[-1,1],armbar:[1,-1],omoplata:[-1,1],bow:[1,1]};
for(const [key,tech]of Object.entries(techniques)){
 if(process.env.BJJ_RENDER_TECHNIQUE&&process.env.BJJ_RENDER_TECHNIQUE!==key)continue;
 const scene=new T.Scene();scene.background=new T.Color(0xd8e4e8);scene.add(new T.AmbientLight(0xffffff,.5));
 const light=new T.DirectionalLight(0xffffff,.65);light.position.set(-3,6,4);scene.add(light);
 const a=new Grappler(scene,0xf2efe5,0x7c648b),b=new Grappler(scene,0x366d9c,0xe8e0cf);
 const floor=new T.Mesh(new T.PlaneGeometry(5,4),new T.MeshBasicMaterial({color:0x88a1ae}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;
 const camera=new T.OrthographicCamera(-2.2,2.2,1.65,-1.65,.1,100),renderer=new SVGRenderer();renderer.setSize(440,330);renderer.setQuality('low');
 const tiles=[];
 for(let view=0;view<4;view++)for(let step=0;step<6;step++){
  const p=process.env.BJJ_RENDER_PROGRESS?Number(process.env.BJJ_RENDER_PROGRESS.split(',')[step]):step/5;let i=0;while(i<tech.frames.length-2&&p>=tech.frames[i+1].t)i++;
  const first=tech.frames[i],next=tech.frames[i+1],t=T.MathUtils.clamp((p-first.t)/(next.t-first.t),0,1);
  posePair([a,b],first.a,next.a,first.b,next.b,t*t*(3-2*t),sides[key],key,p);
  const angle=view*Math.PI/2;camera.position.set(tech.camera[0]*Math.cos(angle)+tech.camera[2]*Math.sin(angle),tech.camera[1],tech.camera[2]*Math.cos(angle)-tech.camera[0]*Math.sin(angle));camera.lookAt(key==='double'?.3:0,key==='double'?.75:.5,0);camera.updateMatrixWorld();scene.updateMatrixWorld(true);
  renderer.render(scene,camera);const svg=renderer.domElement.outerHTML.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/,'$1<rect x="-220" y="-165" width="440" height="330" fill="#d8e4e8"/>');
  const png=await sharp(Buffer.from(svg)).png().toBuffer();tiles.push({input:png,left:step*440,top:view*360+30});
  const label=Buffer.from(`<svg width="440" height="30"><text x="10" y="22" font-family="Arial" font-size="18">${key} ${Math.round(p*100)}% / view ${view+1}</text></svg>`);tiles.push({input:label,left:step*440,top:view*360});
 }
 await sharp({create:{width:2640,height:1440,channels:3,background:'#ffffff'}}).composite(tiles).png().toFile(`${out}/${key}.png`);
 console.log(key);
}
