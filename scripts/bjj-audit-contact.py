"""Audit corrected *skin*, including times between correction keys.

No acceptance claim is made from joint/capsule separation. Keeps the authored
material grip patches, then measures them on the corrected held skin. Writes
all failures rather than rounding large errors away in summary statistics.
"""
import os,runpy,json,hashlib,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parent.parent
os.environ['BJJ_CONTACT_LIBRARY']='1'
lib=runpy.run_path(str(root/'scripts/bjj-refine-contact.py'),run_name='contact_library')
if os.environ.get('BJJ_FAST_AUTHOR')=='1':runpy.run_path(str(root/'scripts/bjj-fast-author.py'),run_name='fast_author')['install'](lib)
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
clip_path=Path(os.environ.get('BJJ_CONTACT_CLIP',str(lib['out']/'contact-poses.npz')))
clip_sha=hashlib.sha256(clip_path.read_bytes()).hexdigest()
clip=Clip(clip_path);skins=lib['skins'];env=lib['env']
step=float(os.environ.get('BJJ_AUDIT_STEP',str(1/24)))
requested=os.environ.get('BJJ_AUDIT_TIMES')
times=[float(x) for x in requested.split(',')] if requested else np.arange(0,22+step/2,step)
assert min(times)>=clip.times[0]-1e-8 and max(times)<=clip.times[-1]+1e-8,'Audit times exceed the actual correction data'
result=[]
def triangle_topology():
    # Diagnostic cross-section of the actual bone loop, independent of contact
    # distances. Skin thickness and an oblique/nonplanar loop limit this test;
    # a failed result requires a visual review, not relabelling the trapped arm.
    a,b=skins
    def joint(s,name):return s.world[s.lookup[name],:3,3]
    polygon=np.array([joint(a,n) for n in ['upperleg01.L','lowerleg01.L','foot.L','lowerleg01.R','upperleg01.R']])
    centre=polygon.mean(0);_,_,axes=np.linalg.svd(polygon-centre);normal=axes[2]
    axis=lib['unit'](joint(b,'neck03')-joint(b,'root'));denominator=float(axis@normal)
    if abs(denominator)<.05:return {'indeterminate':True}
    polygon2=(polygon-centre)@axes[:2].T
    def polygon_contains(point):
        x,y=(point-centre)@axes[:2].T;inside=False
        for (x1,y1),(x2,y2) in zip(polygon2,np.roll(polygon2,-1,axis=0)):
            if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1:inside=not inside
        return bool(inside)
    def crossing(first,last):
        d0=float((first-centre)@normal);d1=float((last-centre)@normal)
        if d0*d1>=0:return 0
        return int(polygon_contains(first+(last-first)*(d0/(d0-d1))))
    def arm(side):
        points=[joint(b,f'{part}.{side}') for part in ['upperarm01','lowerarm01','wrist']]
        return sum(crossing(first,last) for first,last in zip(points,points[1:]))
    return {'neck':polygon_contains(joint(b,'neck03')+axis*(float((centre-joint(b,'neck03'))@normal)/denominator)),
        'leftArmCrossings':arm('L'),'rightArmCrossings':arm('R'),
        'planeWarpMeters':float(np.abs((polygon-centre)@normal).max())}
for t in times:
    env['pose_at'](t)
    for s in skins:s.capture()
    anchors=lib['grip_anchors']()
    bases=clip.sample(t)
    for p,s in enumerate(skins):s.basis=bases[p];s.forward()
    anchors=lib['refresh_finger_contacts'](anchors)
    semantic=lib['technique_contacts'](t)
    collision,depth=lib['contacts']()
    errors={kind:max([float(np.linalg.norm(skins[0].points[v]-(w@skins[p].points[f]+sep))) for v,p,f,w,sep,_,k in anchors if k==kind],default=0) for kind in ['palm','finger']}
    errors['contact']=max([float(np.linalg.norm(tw@skins[o].points[target]+sep-sw@skins[p].points[source])) for p,source,sw,o,target,tw,sep,_ in semantic],default=0)
    errors['depth']=float(depth);errors['floor']=max(0,float(-.008-min(s.points[:,2].min() for s in skins)))
    errors['support']=lib['ground_support_error'](t)
    errors['time']=round(float(t),6)
    if t>=16:errors['topology']=triangle_topology()
    errors['worst']=[{'depth':float(d),'person':p,'part':str(skins[p].dominant[v]),'other':o,'surface':skins[o].dominant[f].tolist()} for d,p,v,o,f,q,n in sorted(collision,key=lambda r:-r[0])[:3]]
    result.append(errors)
    if len(result)%12==0:print('AUDIT',round(float(t),3),{k:round(v*1000,2) for k,v in errors.items() if k not in ['time','worst','topology']},flush=True)
    (lib['out']/'contact-audit.json').write_text(json.dumps(result,indent=2),encoding='utf8')
limits={'depth':.0025,'palm':.008,'finger':.012,'contact':.008,'floor':.002,'support':.008}
failed=[r for r in result if any(r[k]>v for k,v in limits.items())]
assert hashlib.sha256(clip_path.read_bytes()).hexdigest()==clip_sha,'Correction input changed during audit'
summary={'samples':len(result),'clipSha256':clip_sha,'sourceVersion':lib['version'],'limitsMeters':limits,'maximaMeters':{k:max(r[k] for r in result) for k in limits},'failedTimes':[r['time'] for r in failed]}
(lib['out']/'contact-audit-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print('AUDIT_SUMMARY',json.dumps(summary),flush=True)
