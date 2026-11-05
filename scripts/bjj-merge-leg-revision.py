"""Join the audited support phase and the corrected incoming/locking phase."""
import os,json,numpy as np,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
guidepath=Path(os.environ.get('BJJ_GUIDE_CLIP',str(ROOT/'.astro/bjj-both-leg-seed/contact-poses.npz')))
latepath=Path(os.environ.get('BJJ_LATE_CLIP',str(ROOT/'.astro/bjj-both-leg-late/contact-poses.npz')))
guide=np.load(guidepath);late=np.load(latepath)
state=json.loads((latepath.parent/'right-contact-state.json').read_text())
assert len(state['frames'])==217 and all(r['passed'] for r in state['frames'])
assert abs(late['times'][0]-13)<1e-8 and abs(late['times'][-1]-22)<1e-8
assert np.array_equal(guide['names'],late['names'])
bases=guide['basis'].copy();times=guide['times']
for i,t in enumerate(late['times']):bases[round(t*24)]=late['basis'][i]
assert abs(bases[:313]-guide['basis'][:313]).max()<.000001,'Audited prefix changed'
out=Path(os.environ['BJJ_AUTHORING_OUT']);out.mkdir(parents=True,exist_ok=True)
np.savez_compressed(out/'contact-poses.npz',times=times,basis=bases,names=guide['names'])
(out/'composition.json').write_text(json.dumps({'guideSha256':hashlib.sha256(guidepath.read_bytes()).hexdigest(),'lateSha256':hashlib.sha256(latepath.read_bytes()).hexdigest(),'joinSeconds':13,'maximumAuditedPrefixBasisDifference':float(abs(bases[:313]-guide['basis'][:313]).max())},indent=2))
