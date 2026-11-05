"""Blend a skin-checked paired leg lock into the existing closing interval."""
import os,runpy,json,hashlib,numpy as np
from pathlib import Path
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parent.parent
Clip=runpy.run_path(str(ROOT/'scripts/bjj-contact-sample.py'))['ContactClip']
source=Path(os.environ['BJJ_CONTACT_CLIP']);seed=Clip(source)
lockpath=Path(os.environ['BJJ_LOCK_CLIP']);lock=Clip(lockpath)
reference=seed.sample(16);final=lock.sample(16)
names=['upperleg01.R','upperleg02.R','lowerleg01.R','lowerleg02.R','foot.R','upperleg01.L','lowerleg01.L']
ids=[seed.names.index(n) for n in names]
delta=Rotation.from_matrix(np.swapaxes(reference[0,ids,:3,:3],1,2)@final[0,ids,:3,:3]).as_rotvec()
frames=[];start=float(os.environ.get('BJJ_LOCK_BLEND_START','13.5'))
for t in seed.times:
    f=np.clip((t-start)/(16-start),0,1);f=f*f*(3-2*f)
    bases=seed.sample(t);bases[0,ids,:3,:3]=bases[0,ids,:3,:3]@Rotation.from_rotvec(delta*f).as_matrix();frames.append(bases)
out=Path(os.environ['BJJ_AUTHORING_OUT']);out.mkdir(parents=True,exist_ok=True)
np.savez_compressed(out/'contact-poses.npz',times=seed.times,basis=frames,names=seed.names)
(out/'lock-blend.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'lockSha256':hashlib.sha256(lockpath.read_bytes()).hexdigest(),'bones':names,'interval':[start,16],'reviewStatus':'candidate; interpolated trajectory requires independent review'},indent=2))
