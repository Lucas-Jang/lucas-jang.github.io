"""Read-only collision and lock audit on the corrected weighted mesh."""
import os,runpy,json,hashlib,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.environ['BJJ_RIGHT_LIBRARY']='1';os.environ['BJJ_COUPLED_ANKLE']='1'
lib=runpy.run_path(str(ROOT/'scripts/bjj-refine-right-leg.py'))
g=lib['g'];s,b=g['skins'];clip=lib['clip'];rows=[]
timing=np.array(json.loads((ROOT/'src/scripts/bjj-triangle-timing.json').read_text())) if os.environ.get('BJJ_SHARED_RETIME')=='1' else np.array([[0,0],[22,22]])
start=float(os.environ.get('BJJ_RIGHT_AUDIT_START','0'));end=float(os.environ.get('BJJ_RIGHT_AUDIT_END','22'))
assert clip.times[0]<=start+1e-8 and clip.times[-1]>=end-1e-8,'Requested audit range exceeds the saved clip'
step=int(os.environ.get('BJJ_RIGHT_AUDIT_FPS','12'))
times=np.arange(round(start*step),round(end*step)+1)/step
if os.environ.get('BJJ_RIGHT_DENSE_CLOSING')=='1':times=np.unique(np.r_[times,np.arange(round(max(start,13.5)*96),round(min(end,17)*96)+1)/96])
for t in times:
    role_t=float(np.interp(t,timing[:,0],timing[:,1]))
    bases=clip.sample(t)
    for p,skin in enumerate([s,b]):skin.basis=bases[p];skin.forward()
    contacts,depth=g['contacts']();terms=lib['semantic'](role_t);error=max([float(np.linalg.norm(tw@[s,b][o].points[target]+sep-sw@s.points[source])) for p,source,sw,o,target,tw,sep,_ in terms],default=0.)
    _,_,angles=lib['orientation'](t)
    row={'time':float(t),'sourceTime':role_t,'depth':float(depth),'lockError':error if role_t>=16 else None,'supportError':error if 2.5<=role_t<=13.5 else None,'ankleFacing':angles[0],'toeShinDot':angles[1],'kneecapFacing':angles[2],'kneeFlexionDegrees':angles[3]};rows.append(row)
    if round(t*96)%48==0:print('RIGHT_AUDIT',json.dumps(row),flush=True)
contact_limit=float(g['LIMITS'][3])
failed=[r for r in rows if r['depth']>.0025 or (r['lockError'] is not None and r['lockError']>contact_limit) or (r['supportError'] is not None and r['supportError']>contact_limit) or r['ankleFacing']<.65 or r['kneecapFacing']<.2 or (r['sourceTime']>=16 and r['kneeFlexionDegrees']<110)]
summary={'rangeSeconds':[start,end],'clipSha256':hashlib.sha256(lib['source'].read_bytes()).hexdigest(),'samples':len(rows),'maximumDepth':max(r['depth'] for r in rows),'maximumLockError':max(r['lockError'] or 0 for r in rows),'maximumSupportError':max(r['supportError'] or 0 for r in rows),'failed':failed,'rows':rows}
(g['out']/'right-leg-audit.json').write_text(json.dumps(summary,indent=2))
print('RIGHT_AUDIT_DONE',len(failed),'failed of',len(rows),flush=True)
