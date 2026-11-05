"""Combine reviewed correction intervals. Later inputs replace matching times.

Usage: Blender Python bjj-merge-contact.py BASE MID LATE OUTPUT
Each argument is an authoring directory containing contact-poses.npz.
"""
import sys,json,hashlib,numpy as np
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
assert len(args)>=2,'Supply input directories (or a JSON interval manifest) and an output directory'
manifest=json.loads(Path(args[0]).read_text()) if args[0].endswith('.json') else [{'directory':directory} for directory in args[:-1]]
intervals=manifest['intervals'] if isinstance(manifest,dict) else manifest
frames={};reports={};inputs=[];names=None
for interval in intervals:
    path=Path(interval['directory']);raw=(path/'contact-poses.npz').read_bytes();data=np.load(path/'contact-poses.npz')
    if names is None:names=data['names']
    assert np.array_equal(names,data['names']),'Rig identity differs between intervals'
    selected=[i for i,t in enumerate(data['times']) if interval.get('start',0)<=t<=interval.get('end',22)]
    source_reports=json.loads((path/'contact-refinement.json').read_text())
    if interval.get('onlyPassed'):
        passed={r['time'] for r in source_reports if r.get('last') and all(v<=limit for v,limit in zip(r['last'],[.0025,.008,.012,.008,.002,.008])) and all(v<=limit for v,limit in zip(r.get('incoming',[]),[.0025,.008,.012,.008,.002,.008]))}
        selected=[i for i in selected if data['times'][i] in passed]
    selected_times=data['times'][selected].tolist()
    if interval.get('replace'):
        for t in list(frames):
            if interval.get('start',0)<=t<=interval.get('end',22):
                del frames[t];reports.pop(t,None)
    for i in selected:frames[float(data['times'][i])]=data['basis'][i]
    for report in source_reports:
        if report['time'] in selected_times:reports[float(report['time'])]=report
    inputs.append({'directory':str(path),'sha256':hashlib.sha256(raw).hexdigest(),'times':selected_times})
times=sorted(frames)
assert times[0]==0 and times[-1]==22 and np.diff(times).max()<=.500001,'Full coverage required'
if isinstance(manifest,dict) and manifest.get('hold'):
    hold=manifest['hold'];reference=frames[float(hold['source'])].copy()
    for t in times:
        if t>=hold['from']:
            frames[t]=reference.copy();reports[t]={'time':t,'iterations':0,'initial':None,'last':None,'edit':f'Hold reviewed pose at {hold["source"]} seconds; requires dense audit'}
    inputs.append({'hold':hold})
out=Path(args[-1]);out.mkdir(parents=True,exist_ok=True)
np.savez_compressed(out/'contact-poses.npz',times=times,basis=np.array([frames[t] for t in times]),names=names)
(out/'contact-refinement.json').write_text(json.dumps([reports[t] for t in times],indent=2))
(out/'correction-inputs.json').write_text(json.dumps(inputs,indent=2))
print('MERGED',len(times),'correction knots; dense audit still required')
