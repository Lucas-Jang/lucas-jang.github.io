"""Shared correction-clip sampling for export and dense skin review."""
import numpy as np
from scipy.spatial.transform import Rotation

class ContactClip:
    def __init__(self,path):
        data=np.load(path);order=np.argsort(data['times'])
        self.times=data['times'][order];self.bases=data['basis'][order];self.names=data['names'].tolist()
        assert np.all(np.diff(self.times)>0)
        self.translation=self.bases[:,:,:,:3,3]
        self.rotation=Rotation.from_matrix(self.bases[:,:,:,:3,:3].reshape(-1,3,3)).as_quat().reshape(len(order),2,len(self.names),4)

    def sample(self,t):
        if len(self.times)==1:return self.bases[0].copy()
        i=int(np.clip(np.searchsorted(self.times,t,side='right')-1,0,len(self.times)-2));j=i+1
        f=float(np.clip((t-self.times[i])/(self.times[j]-self.times[i]),0,1))
        a=self.rotation[i];b=self.rotation[j];dot=np.sum(a*b,axis=-1,keepdims=True);b=np.where(dot<0,-b,b)
        angle=np.arccos(np.clip(np.abs(dot),0,1));sine=np.sin(angle)
        qa=np.divide(np.sin((1-f)*angle),sine,out=np.full_like(sine,1-f),where=sine>1e-7)
        qb=np.divide(np.sin(f*angle),sine,out=np.full_like(sine,f),where=sine>1e-7)
        q=a*qa+b*qb;q/=np.linalg.norm(q,axis=-1,keepdims=True)
        matrices=np.broadcast_to(np.eye(4),(2,len(self.names),4,4)).copy()
        matrices[:,:,:3,:3]=Rotation.from_quat(q.reshape(-1,4)).as_matrix().reshape(2,len(self.names),3,3)
        matrices[:,:,:3,3]=self.translation[i]*(1-f)+self.translation[j]*f
        return matrices
