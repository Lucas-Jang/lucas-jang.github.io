"""Preserve the fitted hip-support leg and correct the opposing leg's roll."""
import os,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parent.parent
guide=np.load(root/'.astro/bjj-right-path-lock/contact-poses.npz')
left=np.load(root/'.astro/bjj-anatomical-left/contact-poses.npz')
prefix=np.load(root/'.astro/bjj-right-continuous/contact-poses.npz')
names=guide['names'].tolist();times=guide['times'];bases=guide['basis'].copy()
leg=lambda name,side:name.endswith('.'+side) and name.startswith(('upperleg','lowerleg','foot.','toe'))
li=[i for i,n in enumerate(names) if leg(n,'L')];ri=[i for i,n in enumerate(names) if leg(n,'R')]
bases[:,0,li]=left['basis'][:,0,li]
for j,t in enumerate(times):
    if t<=13.5:bases[j,0,ri]=prefix['basis'][j,0,ri]
out=Path(os.environ['BJJ_AUTHORING_OUT']);out.mkdir(parents=True,exist_ok=True)
np.savez_compressed(out/'contact-poses.npz',times=times,basis=bases,names=names)
