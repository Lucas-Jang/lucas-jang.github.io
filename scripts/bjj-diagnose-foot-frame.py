import os,runpy,numpy as np
from pathlib import Path
os.environ['BJJ_RIGHT_LIBRARY']='1'
root=Path(__file__).resolve().parent.parent
lib=runpy.run_path(str(root/'scripts/bjj-refine-right-leg.py'));s=lib['s'];unit=lib['unit']
for t in [14.9,14.95,15,15.05,15.1,16]:
    s.basis=lib['clip'].sample(t)[0];s.forward()
    h,k,f=s.world[lib['jointids'],:3,3];shin=unit(f-k);n=unit(np.cross(k-h,f-k))
    forward=(s.world[lib['jointids'][2],:3,:3]@lib['restfoot'].T@lib['material'])[:,1]
    print('FOOT_FRAME',t,'forward',float(forward@np.cross(shin,n)),'shin',float(forward@shin),flush=True)
