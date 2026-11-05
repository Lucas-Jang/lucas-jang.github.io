// Change only shared animation timestamps; retain the checked spatial SLERP path.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source='.astro/bjj-true-lock-export',out='.astro/bjj-retimed-export';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const metadata=JSON.parse(await fs.readFile(`${source}/build-metadata.json`));
assert.equal(metadata.sourceClipSha256,hash(await fs.readFile('.astro/bjj-true-lock-final/contact-poses.npz')));
const bytes=await fs.readFile(`${source}/triangle-study.glb`);
assert.equal(metadata.assetSha256,hash(bytes));
const jsonLength=bytes.readUInt32LE(12),document=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=Buffer.from(bytes.subarray(28+jsonLength));
const knots=JSON.parse(await fs.readFile('src/scripts/bjj-triangle-timing.json'));
function display(t){const j=knots.findIndex(k=>t<k[1]);const i=j<0?knots.length-2:Math.max(0,j-1);const [a,b]=knots.slice(i,i+2);return a[0]+(b[0]-a[0])*(t-a[1])/(b[1]-a[1]);}
const inputs=new Set(document.animations.flatMap(a=>a.samplers.map(s=>s.input)));
for(const index of inputs){const a=document.accessors[index],v=document.bufferViews[a.bufferView];assert.equal(a.componentType,5126);assert.equal(a.type,'SCALAR');const offset=(v.byteOffset??0)+(a.byteOffset??0);for(let i=0;i<a.count;i++){const o=offset+i*(v.byteStride??4);binary.writeFloatLE(display(binary.readFloatLE(o)),o);}a.min=a.min?.map(display);a.max=a.max?.map(display);}
const jsonRaw=Buffer.from(JSON.stringify(document)),json=Buffer.alloc(Math.ceil(jsonRaw.length/4)*4,32);jsonRaw.copy(json);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
const asset=Buffer.concat([header,json,binHeader,binary]);await fs.writeFile(`${out}/triangle-study.glb`,asset);
const build=JSON.parse(await fs.readFile(`${out}/build-metadata.json`));build.assetSha256=hash(asset);build.retimedFromAssetSha256=metadata.assetSha256;build.displayToSourceSeconds=knots;build.retiming='shared glTF timestamp mapping; checked uniform source export';await fs.writeFile(`${out}/build-metadata.json`,JSON.stringify(build,null,2));
console.log('GLB_RETIMED',inputs.size,'time accessors',asset.length,'bytes');
