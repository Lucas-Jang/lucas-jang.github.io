"""Remove fitted free-arm jitter without filtering a held material grip.

This prepares a solver seed; collision/grip/motion review is still required.
Rotations are averaged on SO(3). Bone translations and proportions stay fixed.
"""
import sys,runpy,numpy as np
from pathlib import Path
from scipy.spatial.transform import Rotation
root=Path(__file__).resolve().parent.parent
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
source,output=map(Path,sys.argv[1:3]);clip=Clip(source);times=np.arange(529)/24
person=int(sys.argv[3]) if len(sys.argv)>3 else 0
original=np.array([clip.sample(t) for t in times]);basis=original.copy()
selected=[i for i,n in enumerate(clip.names) if n.endswith('.R') and n.startswith(('clavicle','shoulder','upperarm','lowerarm','wrist','metacarpal','finger'))]
def smooth(a,b,t):
    u=np.clip((t-a)/(b-a),0,1);return u*u*(3-2*u)
for frame,t in enumerate(times):
    weight=max(smooth(5.5,5.75,t)*(1-smooth(8.75,9,t)),smooth(14,14.25,t)*(1-smooth(16.75,17,t))) if person==0 else smooth(5.5,5.75,t)*(1-smooth(7.75,8,t))
    if weight==0:continue
    ids=np.arange(max(0,frame-4),min(len(times),frame+5));weights=np.exp(-.5*((ids-frame)/2)**2)
    for bone in selected:
        current=Rotation.from_matrix(original[frame,person,bone,:3,:3])
        mean=Rotation.from_matrix(original[ids,person,bone,:3,:3]).mean(weights)
        correction=(current.inv()*mean).as_rotvec()*weight
        basis[frame,person,bone,:3,:3]=(current*Rotation.from_rotvec(correction)).as_matrix()
output.parent.mkdir(parents=True,exist_ok=True)
np.savez_compressed(output,times=times,basis=basis,names=clip.names)
print('FREE_ARM_SEED',output)
