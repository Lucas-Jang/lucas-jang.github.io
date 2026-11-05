"""Check knee flexion and the actual skinned kneecap's forward orientation.

Joint distances alone cannot detect a leg whose skin rolls backwards around
otherwise correct joint locations. This diagnostic uses a rest-skin front
patch and measures its facing against the posed knee's flexion direction.
"""
import os,runpy,json,hashlib,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parent.parent
os.environ['BJJ_CONTACT_LIBRARY']='1'
lib=runpy.run_path(str(root/'scripts/bjj-refine-contact.py'),run_name='library')
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
path=Path(os.environ['BJJ_CONTACT_CLIP']);digest=hashlib.sha256(path.read_bytes()).hexdigest();clip=Clip(path)
assert clip.names==lib['skins'][0].names,'Bone order differs from the authoring rig'
assert abs(clip.times[0])<1e-8 and abs(clip.times[-1]-22)<1e-8,'A full 0–22 second clip is required'
patches={}
for p,s in enumerate(lib['skins']):
    for side in ['L','R']:
        knee=s.rest[s.lookup['lowerleg01.'+side],:3,3]
        mask=(np.linalg.norm(s.v[:,:3]-knee,axis=1)<.075)&(s.v[:,1]<knee[1]-.015)&(s.normals[:,1]<-.4)
        ids=np.flatnonzero(mask);assert len(ids)>3
        patches[p,side]=ids
times=np.arange(2113)/96;rows=[]
for t in times:
    bases=clip.sample(t)
    for p,s in enumerate(lib['skins']):
        s.basis=bases[p];s.forward()
        for side in ['L','R']:
            hip,knee,ankle=[s.world[s.lookup[n+'.'+side],:3,3] for n in ['upperleg01','lowerleg01','foot']]
            axis=lib['unit'](ankle-hip);bend=knee-hip;bend=lib['unit'](bend-axis*(bend@axis))
            cap=s.points[patches[p,side]].mean(0)-knee;cap=lib['unit'](cap-axis*(cap@axis))
            upper,lower=lib['unit'](knee-hip),lib['unit'](ankle-knee)
            flex=float(np.degrees(np.arccos(np.clip(upper@lower,-1,1))));facing=float(cap@bend)
            foot=s.lookup['foot.'+side]
            lateral=s.world[foot,:3,:3]@s.rest[foot,:3,:3].T@np.array([1,0,0])
            ankle_facing=float(lib['unit'](np.cross(upper,lower))@lateral)
            rows.append({'time':float(t),'person':p,'side':side,'flexionDegrees':flex,'kneecapFacing':facing,'ankleLateralFacing':ankle_facing})
    if round(t*96)%192==0:print('KNEE_AUDIT',round(float(t),3),flush=True)
failed=[r for r in rows if r['kneecapFacing']<.2 or r['ankleLateralFacing']<.65 or not 4.5<=r['flexionDegrees']<=155.5]
summary={'clipSha256':digest,'times':len(times),'knees':len(rows),'limits':{'minimumKneecapFacing':.2,'minimumAnkleLateralFacing':.65,'minimumFlexionDegrees':4.5,'maximumFlexionDegrees':155.5},'minimumFacing':min(r['kneecapFacing'] for r in rows),'minimumAnkleFacing':min(r['ankleLateralFacing'] for r in rows),'minimumFlexion':min(r['flexionDegrees'] for r in rows),'maximumFlexion':max(r['flexionDegrees'] for r in rows),'failed':failed}
summary['limbs']={f'{p}{side}':{'minimumKneecapFacing':min(r['kneecapFacing'] for r in rows if r['person']==p and r['side']==side),'minimumAnkleFacing':min(r['ankleLateralFacing'] for r in rows if r['person']==p and r['side']==side)} for p in range(2) for side in ['L','R']}
assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
(lib['out']/'knee-audit.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print('KNEE_AUDIT_DONE','failed',len(failed),'minimumFacing',summary['minimumFacing'],'minimumAnkleFacing',summary['minimumAnkleFacing'],'flexion',summary['minimumFlexion'],summary['maximumFlexion'],flush=True)
if os.environ.get('BJJ_KNEE_REPORT_ONLY')!='1':assert not failed,failed[:3]
