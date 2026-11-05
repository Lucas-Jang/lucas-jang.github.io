"""Assemble an editable clip from bounded full-skin contact refinement poses."""
import runpy,numpy as np,os,json,hashlib
from pathlib import Path
from mathutils import Matrix
root=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(root/'scripts/bjj-build-triangle.py'),run_name='bjj_definitions')
clip_path=Path(os.environ.get('BJJ_CONTACT_CLIP',str(env['OUT']/'contact-poses.npz')))
clip_sha=hashlib.sha256(clip_path.read_bytes()).hexdigest()
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
clip=Clip(clip_path);times=clip.times;names=clip.names
assert len(times)>1 and times[0]==0 and times[-1]==22,'A full corrected clip is required for export'
assert np.all(np.diff(times)>0),'Duplicate correction times'
def pose(t):
    matrices=clip.sample(t)
    for p,(actor,_) in enumerate(env['actors']):
        for k,name in enumerate(names):actor.pose.bones[name].matrix_basis=Matrix(matrices[p,k].tolist())
    env['bpy'].context.view_layer.update()
env['build_clip'].__globals__['pose_at']=pose
if os.environ.get('BJJ_WITNESS_ONLY')!='1':env['build_clip']()

# Compare these evaluated Blender skin points with GLTFLoader + AnimationMixer,
# including metacarpal and fingertip influences, before accepting an asset.
witness={'times':[0,.137,1.6875,2.0625,119/48,3.14159,193/48,5.125,143/24,6.271,7.139,8.513,9.017,10.263,11.431,12.017,14.479,15.513,16.027,17.141,19.013,22],'actors':[]}
for p,(actor,mesh) in enumerate(env['actors']):
    ids=set(np.linspace(0,len(mesh.data.vertices)-1,400,dtype=int).tolist())
    for vertex in mesh.data.vertices:
        if any(mesh.vertex_groups[g.group].name.startswith(('finger','metacarpal','wrist')) for g in vertex.groups):ids.add(vertex.index)
    ids=sorted(ids)
    def canonical(v):return [float(v.x),float(v.z),float(-v.y)]
    record={'name':mesh.name,'rest':[canonical(mesh.data.vertices[i].co) for i in ids],'positions':[]}
    for t in witness['times']:
        pose(t)
        evaluated=mesh.evaluated_get(env['bpy'].context.evaluated_depsgraph_get());surface=evaluated.to_mesh()
        record['positions'].append([canonical(mesh.matrix_world@surface.vertices[i].co) for i in ids])
        evaluated.to_mesh_clear()
    witness['actors'].append(record)
(env['OUT']/'skin-witness.json').write_text(json.dumps(witness,separators=(',',':')),encoding='utf8')

# Dense global bone witnesses connect the contact review's entire sampled
# trajectory to the actual browser animation, without a huge skin-point JSON.
dense_times=np.arange(22*96+1,dtype=float)/96
dense_basis=np.array([clip.sample(t) for t in dense_times]);world=np.empty_like(dense_basis)
lookup={name:i for i,name in enumerate(names)};relative=[];parents=None
for actor,_ in env['actors']:
    rest=np.array([np.array(actor.data.bones[name].matrix_local) for name in names]);inverse=np.linalg.inv(rest)
    parent=np.array([lookup[actor.data.bones[name].parent.name] if actor.data.bones[name].parent else -1 for name in names])
    assert all(p<i for i,p in enumerate(parent))
    if parents is not None:assert np.array_equal(parent,parents)
    parents=parent;relative.append(np.array([inverse[p]@r if p>=0 else r for p,r in zip(parent,rest)]))
relative=np.array(relative)
for i,p in enumerate(parents):world[:,:,i]=(world[:,:,p]@relative[:,i] if p>=0 else relative[:,i])@dense_basis[:,:,i]
canonical_world=np.empty(world.shape,dtype='<f4')
canonical_world[...,0,:]=world[...,0,:];canonical_world[...,1,:]=world[...,2,:]
canonical_world[...,2,:]=-world[...,1,:];canonical_world[...,3,:]=world[...,3,:]
canonical_world.tofile(env['OUT']/'pose-witness.bin')
(env['OUT']/'pose-witness.json').write_text(json.dumps({'times':dense_times.tolist(),'names':names,'actors':[mesh.name for _,mesh in env['actors']],'shape':list(world.shape),'storage':'little-endian float32, row-major matrices'},separators=(',',':')),encoding='utf8')
assert hashlib.sha256(clip_path.read_bytes()).hexdigest()==clip_sha,'Correction input changed during export'
metadata={'sourceClipSha256':clip_sha,'assetSha256':hashlib.sha256((env['OUT']/'triangle-study.glb').read_bytes()).hexdigest(),'fps':24,'durationSeconds':22,'denseWitnessFps':96,'denseWitnessSamples':len(dense_times),'sourceScripts':{name:hashlib.sha256((root/'scripts'/name).read_bytes()).hexdigest() for name in ['bjj-build-triangle.py','bjj-build-refined.py','bjj-contact-sample.py']}}
(env['OUT']/'build-metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf8')
print('DENSE_RUNTIME_WITNESS',len(dense_times),'times',flush=True)
