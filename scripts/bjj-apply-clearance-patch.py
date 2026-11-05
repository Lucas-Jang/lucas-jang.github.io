"""Replace the three inspected, uniform source keys before paired retiming."""
import numpy as np,json,shutil
from pathlib import Path
root=Path(__file__).resolve().parent.parent
path=root/'.astro/bjj-true-lock-final/contact-poses.npz'
backup=path.with_name('before-clearance.npz')
if not backup.exists():shutil.copyfile(path,backup)
data=np.load(backup);patch=np.load(root/'.astro/bjj-clearance-patch/contact-poses.npz')
state=json.loads((root/'.astro/bjj-clearance-patch/right-contact-state.json').read_text())
assert len(state['frames'])==3 and all(r['passed'] for r in state['frames'])
basis=data['basis'].copy()
for t,pose in zip(patch['times'],patch['basis']):
    i=int(np.argmin(abs(data['times']-t)));assert abs(data['times'][i]-t)<1e-8
    basis[i]=pose
np.savez_compressed(path,times=data['times'],basis=basis,names=data['names'])
print('CLEARANCE_PATCH_APPLIED',patch['times'].tolist())
