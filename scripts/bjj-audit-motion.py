"""Detect bone position discontinuities before exporting a contact candidate."""
import os,runpy,json,hashlib,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parent.parent;os.environ['BJJ_CONTACT_LIBRARY']='1'
lib=runpy.run_path(str(root/'scripts/bjj-refine-contact.py'),run_name='library')
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
path=Path(os.environ['BJJ_CONTACT_CLIP']);clip=Clip(path);times=np.arange(1321)/60
assert abs(clip.times[0])<1e-8 and abs(clip.times[-1]-22)<1e-8,'A full 0–22 second clip is required'
basis=np.array([clip.sample(t) for t in times]);world=np.empty_like(basis)
for p,s in enumerate(lib['skins']):
    for i,parent in enumerate(s.parents):world[:,p,i]=(world[:,p,parent]@s.relative[i] if parent>=0 else s.relative[i])@basis[:,p,i]
distance=np.linalg.norm(np.diff(world[...,:3,3],axis=0),axis=-1)
failed=[]
for frame,p,bone in np.argwhere(distance>=.10):
    failed.append({'time':float(times[frame+1]),'person':int(p),'bone':str(clip.names[bone]),'distanceMeters':float(distance[frame,p,bone])})
failed.sort(key=lambda r:-r['distanceMeters'])
frame,person,bone=np.unravel_index(distance.argmax(),distance.shape)
worst={'time':float(times[frame+1]),'person':int(person),'bone':str(clip.names[bone]),'distanceMeters':float(distance[frame,person,bone])}
summary={'clipSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'samples':len(times),'stepSeconds':1/60,'maximumStepMeters':float(distance.max()),'worst':worst,'failed':failed}
(lib['out']/'motion-audit.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print('MOTION_AUDIT','maximum',summary['maximumStepMeters'],'failed',len(failed),'worst',worst,flush=True)
if os.environ.get('BJJ_MOTION_REPORT_ONLY')!='1':assert not failed,failed[:3]
