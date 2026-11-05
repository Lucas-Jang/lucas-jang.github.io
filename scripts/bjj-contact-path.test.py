"""Finite-difference checks for the endpoint gradient used by path correction."""
import runpy,unittest,numpy as np
from pathlib import Path
from scipy.spatial.transform import Rotation
path=Path(__file__).resolve().parent
interpolate=runpy.run_path(str(path/'bjj-contact-path.py'))['interpolate_endpoint']
Clip=runpy.run_path(str(path/'bjj-contact-sample.py'))['ContactClip']

class PathDerivative(unittest.TestCase):
    def test_noncommuting_endpoint_derivative(self):
        rng=np.random.default_rng(778);count=120
        a=np.broadcast_to(np.eye(4),(count,4,4)).copy();b=a.copy()
        a[:,:3,:3]=Rotation.random(count,random_state=rng).as_matrix()
        delta=rng.normal(size=(count,3));delta/=np.linalg.norm(delta,axis=1)[:,None]
        delta*=np.linspace(1e-7,np.pi-1e-4,count)[:,None]
        b[:,:3,:3]=a[:,:3,:3]@Rotation.from_rotvec(delta).as_matrix()
        axes=rng.normal(size=(count,3));axes/=np.linalg.norm(axes,axis=1)[:,None]
        for t in [.25,.5,.75]:
            mid,mapping=interpolate(a,b,t);h=1e-6
            before=b.copy();after=b.copy()
            before[:,:3,:3]=b[:,:3,:3]@Rotation.from_rotvec(-h*axes).as_matrix()
            after[:,:3,:3]=b[:,:3,:3]@Rotation.from_rotvec(h*axes).as_matrix()
            left,_=interpolate(a,before,t);right,_=interpolate(a,after,t)
            measured=Rotation.from_matrix(np.swapaxes(left[:,:3,:3],1,2)@right[:,:3,:3]).as_rotvec()/(2*h)
            expected=np.einsum('nij,nj->ni',mapping,axes)
            self.assertLess(float(abs(measured-expected).max()),2e-7)

    def test_matches_clip_slerp(self):
        import tempfile
        rng=np.random.default_rng(129)
        basis=np.broadcast_to(np.eye(4),(2,2,3,4,4)).copy()
        basis[...,:3,:3]=Rotation.random(12,random_state=rng).as_matrix().reshape(2,2,3,3,3)
        basis[...,:3,3]=rng.normal(size=(2,2,3,3))
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'poses.npz';np.savez(file,times=[0,1],basis=basis,names=['a','b','c'])
            clip=Clip(file)
            for t in [0,.125,.5,.825,1]:
                actual,_=interpolate(basis[0],basis[1],t)
                self.assertLess(float(abs(actual-clip.sample(t)).max()),1e-12)

if __name__=='__main__':unittest.main()
