import os,runpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.environ['BJJ_RIGHT_LIBRARY']='1';os.environ['BJJ_COUPLED_ANKLE']='1'
lib=runpy.run_path(str(ROOT/'scripts/bjj-refine-right-leg.py'));g=lib['g'];skins=g['skins']
for t in [5,8,14,16]:
    bases=lib['clip'].sample(t)
    for p,s in enumerate(skins):s.basis=bases[p];s.forward()
    for r in sorted(g['contacts']()[0],key=lambda r:-r[0])[:3]:
        depth,p,v,o,face,q,n=r
        print('DIAG',t,depth,p,skins[p].dominant[v],o,skins[o].dominant[face].tolist(),flush=True)
