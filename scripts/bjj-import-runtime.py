"""Recover authoring transforms from the widget GLB's actual runtime poses."""
import os,runpy,json,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(root/'scripts/bjj-build-triangle.py'),run_name='definitions')
source=Path(os.environ.get('BJJ_RUNTIME_OUT','.astro/bjj-current-runtime'))
meta=json.loads((source/'runtime-world.json').read_text(encoding='utf8'))
world=np.fromfile(source/'runtime-world.bin',dtype='<f8').reshape(meta['shape'])
names=[];pending=list(env['actors'][0][0].data.bones)
while pending:
    for bone in pending[:]:
        if bone.parent is None or bone.parent.name in names:names.append(bone.name);pending.remove(bone)
reorder=[meta['names'].index(n) for n in names];world=world[:,:,reorder]
lookup={n:i for i,n in enumerate(names)}
convert=np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],float)
inverse=np.linalg.inv(convert);basis=np.empty_like(world);maximum_axis_origin=0
for p,(actor,_) in enumerate(env['actors']):
    rest=np.array([np.array(actor.data.bones[n].matrix_local) for n in names])
    axis=np.linalg.inv(convert@rest)@np.linalg.inv(np.array(meta['inverseBind'][p]).reshape(-1,4,4)[reorder])
    maximum_axis_origin=max(maximum_axis_origin,float(abs(axis[:,:3,3]).max()))
    assert maximum_axis_origin<.0002,maximum_axis_origin
    axis[:,:3,3]=0
    poses=inverse@world[:,p]@np.linalg.inv(axis)
    for i,name in enumerate(names):
        parent=actor.data.bones[name].parent
        relative=np.linalg.inv(rest[lookup[parent.name]])@rest[i] if parent else rest[i]
        before=poses[:,lookup[parent.name]]@relative if parent else relative
        basis[:,p,i]=np.linalg.inv(before)@poses[:,i]
out=env['OUT'];np.savez_compressed(out/'contact-poses.npz',times=meta['times'],basis=basis,names=names)
(out/'runtime-input.json').write_text(json.dumps({'source':meta['source'],'sourceSha256':meta['sourceSha256'],'maximumAxisOriginErrorMeters':maximum_axis_origin},indent=2),encoding='utf8')
print('IMPORTED_ACTUAL_RUNTIME','frames',len(meta['times']),'axisOriginError',maximum_axis_origin,flush=True)
