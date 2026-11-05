"""Retime the paired, checked motion without changing its spatial path."""
import json,runpy,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=root/'.astro/bjj-true-lock-final/contact-poses.npz'
out=root/'.astro/bjj-retimed-leg';out.mkdir(exist_ok=True)
knots=np.array(json.loads((root/'src/scripts/bjj-triangle-timing.json').read_text()))
data=np.load(source)
np.savez_compressed(out/'contact-poses.npz',times=np.interp(data['times'],knots[:,1],knots[:,0]),basis=data['basis'],names=data['names'])
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
a,b=Clip(source),Clip(out/'contact-poses.npz')
error=max(np.max(np.abs(a.sample(np.interp(t,knots[:,0],knots[:,1]))-b.sample(t))) for t in np.arange(2113)/96)
assert error<1e-10
(out/'retiming-parity.json').write_text(json.dumps({'maximumPoseBasisDifference':float(error),'samples':2113,'displayToSourceSeconds':knots.tolist()},indent=2))
print('RETIME_PATH_PARITY',error)
