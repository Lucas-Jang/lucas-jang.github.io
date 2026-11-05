"""Check that joining the new close retains every audited prefix sample."""
import runpy,numpy as np,json,os
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
Clip=runpy.run_path(str(ROOT/'scripts/bjj-contact-sample.py'))['ContactClip']
a=Clip(ROOT/'.astro/bjj-both-leg-seed/contact-poses.npz');final=Path(os.environ.get('BJJ_CONTACT_CLIP',str(ROOT/'.astro/bjj-leg-final/contact-poses.npz')));b=Clip(final)
maximum=max(float(abs(a.sample(t)-b.sample(t)).max()) for t in np.arange(1249)/96)
assert maximum<.000001,maximum
result={'rangeSeconds':[0,13],'samples':1249,'maximumPoseBasisDifference':maximum}
(final.parent/'prefix-audit-parity.json').write_text(json.dumps(result,indent=2));print(result)
