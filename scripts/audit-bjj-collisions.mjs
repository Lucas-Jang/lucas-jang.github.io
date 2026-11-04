import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
await build({stdin:{contents:"export {contacts} from './src/scripts/bjj-collision.ts';export {sampleMotion} from './src/scripts/bjj-motion-sample.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:'.astro/bjj-collision.cjs',logLevel:'silent'});
const {contacts,sampleMotion}=require('../.astro/bjj-collision.cjs');
const input=process.argv[3]??'src/scripts/bjj-motion-data.ts';
const text=await fs.readFile(input,'utf8'),data=input.endsWith('.json')?JSON.parse(text):JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;$/,''));
const summary={};
for(const [key,frames]of Object.entries(data)){
 const grouped={};let bad=0;
 const subdivisions=Number(process.env.BJJ_AUDIT_SUBSTEPS??4),total=(frames.length-1)*subdivisions+1;
 for(let n=0;n<total;n++){
  const f=n/subdivisions,people=sampleMotion(frames,n/(total-1));
  const cs=contacts(people).filter(c=>c.depth>.006);if(cs.length)bad++;
  for(const c of cs){const id=`${c.kind} ${c.owner}/${c.limb??'body'}/${c.part??''} -> ${c.other}/${c.shape?.name??`${c.peer?.limb}/${c.peer?.part}`}`;const g=grouped[id]??={count:0,depth:0,frame:0};g.count++;if(c.depth>g.depth){g.depth=c.depth;g.frame=f;}}
 }
 const failures=Object.entries(grouped).map(([pair,g])=>({pair,...g})).sort((a,b)=>b.depth-a.depth);
 summary[key]={badFrames:bad,totalFrames:total,failures};console.log(key,JSON.stringify(summary[key]));
}
await fs.writeFile(process.argv[2]??'.astro/bjj-volume-audit.json',JSON.stringify(summary,null,2));
if(process.env.BJJ_AUDIT_REPORT_ONLY!=='1'&&Object.values(summary).some(s=>s.badFrames))process.exitCode=1;
