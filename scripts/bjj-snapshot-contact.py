"""Checkpoint a finished interval without interrupting its longer authoring job."""
import sys,json,time,shutil,zipfile,numpy as np
from pathlib import Path
source,out=map(Path,sys.argv[1:3]);start,end=map(float,sys.argv[3:5])
for attempt in range(30):
    try:
        with np.load(source/'contact-poses.npz') as data:
            selected=(data['times']>=start)&(data['times']<=end)
            times=data['times'][selected];basis=data['basis'][selected];names=data['names'].copy()
        reports=json.loads((source/'contact-refinement.json').read_text(encoding='utf8'))
        reports=[r for r in reports if start<=r['time']<=end]
        assert times[0]==start and times[-1]==end
        assert set(times)=={r['time'] for r in reports}
        break
    except (ValueError,EOFError,zipfile.BadZipFile,json.JSONDecodeError,AssertionError):
        if attempt==29:raise
        time.sleep(.05)
out.mkdir(parents=True,exist_ok=True)
np.savez_compressed(out/'contact-poses.npz',times=times,basis=basis,names=names)
(out/'contact-refinement.json').write_text(json.dumps(reports,indent=2),encoding='utf8')
if (source/'authoring-version.json').exists():shutil.copyfile(source/'authoring-version.json',out/'authoring-version.json')
print('CHECKPOINT',len(times),'frames',start,'to',end,'saved to',out)
