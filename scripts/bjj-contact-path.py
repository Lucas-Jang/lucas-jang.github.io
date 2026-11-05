"""Shortest-arc pose interpolation and its endpoint rotation differential.

The differential maps a right-local perturbation of the endpoint onto the
interpolated bone. Multiplying every angular derivative by t is only correct
for commuting rotations and gives wrong gradients around bent joints.
"""
import numpy as np
from scipy.spatial.transform import Rotation

def right_jacobian(v):
    v=np.asarray(v,dtype=float);theta=np.linalg.norm(v,axis=-1)
    x,y,z=np.moveaxis(v,-1,0);zero=np.zeros_like(x)
    skew=np.stack([zero,-z,y,z,zero,-x,-y,x,zero],axis=-1).reshape(v.shape[:-1]+(3,3))
    a=np.divide(1-np.cos(theta),theta**2,out=np.full_like(theta,.5),where=theta>1e-5)
    b=np.divide(theta-np.sin(theta),theta**3,out=np.full_like(theta,1/6),where=theta>1e-5)
    return np.eye(3)-a[...,None,None]*skew+b[...,None,None]*(skew@skew)

def interpolate_endpoint(previous,current,t=.5):
    relative=np.swapaxes(previous[...,:3,:3],-1,-2)@current[...,:3,:3]
    shape=relative.shape
    rotation=Rotation.from_matrix(relative.reshape(-1,3,3)).as_rotvec().reshape(shape[:-2]+(3,))
    result=np.broadcast_to(np.eye(4),current.shape).copy()
    result[...,:3,:3]=previous[...,:3,:3]@Rotation.from_rotvec((t*rotation).reshape(-1,3)).as_matrix().reshape(shape)
    result[...,:3,3]=(1-t)*previous[...,:3,3]+t*current[...,:3,3]
    differential=t*right_jacobian(t*rotation)@np.linalg.inv(right_jacobian(rotation))
    return result,differential

class PathConstraints:
    """Project the incoming segment as well as the endpoint's visible skin."""
    def __init__(self,lib):self.lib=lib;self.checked=False

    def terms(self,previous,previous_roles,current_roles,anchors,time,fraction=.5):
        lib=self.lib;skins=lib['skins']
        endpoint=np.array([s.basis.copy() for s in skins]);mid,mapping=interpolate_endpoint(np.array(previous),endpoint,fraction)
        def set_mid():
            for p,s in enumerate(skins):
                s.basis=mid[p].copy();s.forward()
                s.axes=np.array([s.world[b,:3,:3]@mapping[p,b]@axis for b,axis,_ in s.spec])
        def jacobian(person,vertices):
            result=lib['full_jac'](person,vertices).copy()
            for offset in lib['offsets']:result[:,:,offset:offset+3]*=fraction
            return result
        set_mid()
        try:
            if not self.checked and lib['os'].environ.get('BJJ_SWEPT_CHECK')=='1':
                s=skins[0];maximum=0
                for name,part in [('root','calf.L'),('upperleg01.L','calf.L'),('wrist.R','hand.R')]:
                    k=next(i for i,(bone,_,_) in enumerate(s.spec) if s.names[bone]==name)
                    bone,axis,_=s.spec[k];vertex=int(s.parts[part][len(s.parts[part])//2]);expected=s.point_jacobian([vertex])[0,:,k+3]
                    positions=[];h=1e-5
                    for sign in [-1,1]:
                        trial=endpoint.copy();trial[0,bone,:3,:3]=trial[0,bone,:3,:3]@Rotation.from_rotvec(sign*h*axis).as_matrix()
                        pose,_=interpolate_endpoint(np.array(previous),trial,fraction)
                        s.basis=pose[0];s.forward();positions.append(s.points[vertex].copy())
                    maximum=max(maximum,float(abs((positions[1]-positions[0])/(2*h)-expected).max()));set_mid()
                print('PATH_SKIN_JAC_ERROR',maximum,flush=True);assert maximum<.000005
                self.checked=True
            collision,depth=lib['contacts']()
            shared=[]
            for item in anchors:
                vertex,*_,kind=item;side=skins[0].dominant[vertex][-1]
                before=previous_roles.get(side);after=current_roles.get(side)
                if before and after and before[:3]==after[:3] and (kind!='finger' or before[3] and after[3]):shared.append(item)
            shared=lib['refresh_finger_contacts'](shared)
            semantic=lib['technique_contacts'](time)
            ground=lib['ground_support_patches'](time)
            cache_supports=[np.concatenate([ids for person,ids in ground if person==p]) if any(person==p for person,_ in ground) else np.array([],int) for p in range(2)]
            floors=lib['cache_jacobians'](collision,shared,semantic,cache_supports)
            rows=[];goals=[]
            for penetration,p,v,o,face,q,n in collision:
                weights=lib['barycentric'](q,skins[o].points[face])
                jac=jacobian(p,[v])[0]-np.einsum('i,ijk->jk',weights,jacobian(o,face))
                rows.append((n@jac)[None,:]*35);goals.append(np.array([penetration+(.0015 if p==o else .003)])*35)
            for v,p,face,w,sep,weight,kind in shared:
                error=w@skins[p].points[face]+sep-skins[0].points[v]
                jac=jacobian(0,[v])[0]-np.einsum('i,ijk->jk',w,jacobian(p,face))
                rows.append(jac*weight);goals.append(error*weight)
            for p,source,sw,o,target,tw,sep,weight in semantic:
                error=tw@skins[o].points[target]+sep-sw@skins[p].points[source]
                jac=np.einsum('i,ijk->jk',sw,jacobian(p,source))-np.einsum('i,ijk->jk',tw,jacobian(o,target))
                rows.append(jac*weight);goals.append(error*weight)
            for p,s in enumerate(skins):
                floor=floors[p]
                if len(floor):rows.append(jacobian(p,floor)[:,2,:]*35);goals.append((-.006-s.points[floor,2])*35)
            for p,ids in ground:
                rows.append(jacobian(p,ids)[:,2,:]*25);goals.append((-.006-skins[p].points[ids,2])*25)
            if lib.get('extra_path_constraints'):
                extra_rows,extra_goals=lib['extra_path_constraints'](time)
                rows.extend(extra_rows);goals.extend(extra_goals)
            errors=[max([float(np.linalg.norm(w@skins[p].points[face]+sep-skins[0].points[v])) for v,p,face,w,sep,_,kind in shared if kind==target],default=0) for target in ['palm','finger']]
            contact=max([float(np.linalg.norm(tw@skins[o].points[target]+sep-sw@skins[p].points[source])) for p,source,sw,o,target,tw,sep,_ in semantic],default=0)
            floor_error=lib['floor_error']() if lib.get('floor_error') else max(0,float(-.008-min(s.points[:,2].min() for s in skins)))
            metrics=(float(depth),*errors,contact,floor_error,lib['ground_support_error'](time))
            return rows,goals,metrics
        finally:
            for p,s in enumerate(skins):s.basis=endpoint[p];s.forward()
            lib['vertex_jacobian_cache']=None
