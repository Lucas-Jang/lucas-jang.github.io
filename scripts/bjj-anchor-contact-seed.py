"""Keep a reviewed trajectory while fading a fitted boundary correction.

This is a solver seed only, never an accepted contact result.
"""
import sys, runpy
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation

Clip = runpy.run_path(str(Path(__file__).with_name('bjj-contact-sample.py')))['ContactClip']
reference, boundary, output = map(Path, sys.argv[1:4])
start, end = map(float, sys.argv[4:6])
source, anchor = Clip(reference), Clip(boundary)
before, after = source.sample(start), anchor.sample(start)
delta = after[..., :3, :3] @ np.swapaxes(before[..., :3, :3], -1, -2)
rotation = Rotation.from_matrix(delta.reshape(-1, 3, 3)).as_rotvec()
translation = after[..., :3, 3] - before[..., :3, 3]
times = np.arange(529) / 24
frames = []
corrections = None
if len(sys.argv)>6:
    # Grounded landmark poses prevent a causal warm start from wandering away
    # from the required contact before that contact becomes mandatory.
    landmark_path=Path(sys.argv[6]);landmarks=Clip(landmark_path)
    with np.load(landmark_path) as data:
        correction_times=[start]+[float(t) for t in data['times'] if t>start]
        names=data['names'].copy()
    correction_frames=[]
    for t in correction_times:
        original=source.sample(t);fitted=anchor.sample(t) if t==start else landmarks.sample(t)
        delta_basis=np.broadcast_to(np.eye(4),original.shape).copy()
        delta_basis[...,:3,:3]=fitted[...,:3,:3]@np.swapaxes(original[...,:3,:3],-1,-2)
        delta_basis[...,:3,3]=fitted[...,:3,3]-original[...,:3,3]
        correction_frames.append(delta_basis)
    output.parent.mkdir(parents=True,exist_ok=True)
    correction_path=output.with_suffix('.corrections.npz')
    np.savez_compressed(correction_path,times=correction_times,basis=correction_frames,names=names)
    corrections=Clip(correction_path)
for t in times:
    if t <= start:
        pose = anchor.sample(t)
    else:
        pose = source.sample(t)
        u = np.clip((t-start)/(end-start), 0, 1);weight = 1-u*u*(3-2*u)
        correction = corrections.sample(t)[...,:3,:3] if corrections else Rotation.from_rotvec(weight*rotation).as_matrix().reshape(delta.shape)
        pose[..., :3, :3] = correction @ pose[..., :3, :3]
        pose[..., :3, 3] += corrections.sample(t)[...,:3,3] if corrections else weight*translation
    frames.append(pose)
output.parent.mkdir(parents=True, exist_ok=True)
with np.load(reference) as data:
    np.savez_compressed(output, times=times, basis=np.array(frames), names=data['names'])
print('SEED_ONLY', output, len(times))
