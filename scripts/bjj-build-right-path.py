"""Keep the supporting right foot on the hip, then close around the outside.

The old clip released the supporting foot into the partner's torso. Construct
the support from the partner's actual skin and retain the checked final lock.
"""
import os,runpy,numpy as np,math,json,hashlib
from pathlib import Path
from mathutils import Matrix,Vector
ROOT=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(ROOT/'scripts/bjj-build-triangle.py'),run_name='definitions')
Clip=runpy.run_path(str(ROOT/'scripts/bjj-contact-sample.py'))['ContactClip']
source=Path(os.environ['BJJ_CONTACT_CLIP']);clip=Clip(source);lock=Clip(Path(os.environ['BJJ_LOCK_CLIP']))
actor=env['actors'][0][0];names=['upperleg01.R','upperleg02.R','lowerleg01.R','lowerleg02.R','foot.R']
def assign(bases):
    for p,(a,_) in enumerate(env['actors']):
        for i,n in enumerate(clip.names):a.pose.bones[n].matrix_basis=Matrix(bases[p,i].tolist())
    env['bpy'].context.view_layer.update()
assign(lock.sample(16));finalpositions=[env['point'](actor,n) for n in names];finalfoot=actor.pose.bones['foot.R'].matrix.to_quaternion()
leftnames=['upperleg01.L','lowerleg01.L'];leftids=[clip.names.index(n) for n in leftnames]
reference=clip.sample(16);fitted=lock.sample(16)
from scipy.spatial.transform import Rotation
leftdelta=Rotation.from_matrix(np.swapaxes(reference[0,leftids,:3,:3],1,2)@fitted[0,leftids,:3,:3]).as_rotvec()
frames=[]
for t in clip.times:
    bases=clip.sample(t);close=env['smooth'](13.5,16,t)
    bases[0,leftids,:3,:3]=bases[0,leftids,:3,:3]@Rotation.from_rotvec(leftdelta*close).as_matrix()
    assign(bases);original=[env['point'](actor,n) for n in names];oldfoot=actor.pose.bones['foot.R'].matrix.to_quaternion()
    h,k,f=original[0],original[2],original[4];normal=(k-h).cross(f-k).normalized()
    for name,a,b in zip(names[:4],original,original[1:]):env['set_leg_bone'](actor,name,a,b,normal);env['bpy'].context.view_layer.update()
    plant=env['smooth'](1.5,2.5,t)
    if plant:
        for _ in range(2):
            post,qpost,out=env['foot_contact']('R',env['point'](actor,'lowerleg01.R'),env['point'](actor,'foot.R'))
            target=original[-1].lerp(post,plant)+out*(.04*math.sin(math.pi*plant))
            axis=(target-h).normalized();lateral=qpost.to_matrix()@actor.data.bones['foot.R'].matrix_local.to_3x3().transposed()@Vector((1,0,0))
            lateral-=axis*lateral.dot(axis);lateral.normalize()
            pole=h+(target-h)*.5+axis.cross(lateral)*.5
            end,knee=env['chain'](actor,'R','leg',env['canonical'](target),env['canonical'](original[2].lerp(pole,plant)),Matrix.Identity(4))
            actor.pose.bones['foot.R'].matrix=Matrix.LocRotScale(end,oldfoot.slerp(qpost,plant),Vector((1,1,1)))
        if close:
            postend=end.copy();postknee=knee.copy()
            outward=Vector((-1,0,0));rise=Vector((0,0,1))
            # A curved outside path avoids the straight shortcut through the
            # partner's upper arm and the demonstrator's other ankle.
            p1=postend+outward*.23+rise*.12;p2=finalpositions[-1]+outward*.18+rise*.10
            end=postend*(1-close)**3+p1*(3*(1-close)**2*close)+p2*(3*(1-close)*close**2)+finalpositions[-1]*close**3
            hint=postknee.lerp(finalpositions[2],close)+outward*(.12*math.sin(math.pi*close))
            end,knee=env['chain'](actor,'R','leg',env['canonical'](end),env['canonical'](hint),Matrix.Identity(4))
            normal=(knee-h).cross(end-knee).normalized();env['set_foot_bone'](actor,'R',end,end+normal,normal)
            free=actor.pose.bones['foot.R'].matrix.to_quaternion()
            q=qpost.slerp(free,env['smooth'](0,.25,close)).slerp(finalfoot,env['smooth'](.75,1,close))
            actor.pose.bones['foot.R'].matrix=Matrix.LocRotScale(end,q,Vector((1,1,1)))
    else:actor.pose.bones['foot.R'].matrix=Matrix.LocRotScale(original[-1],oldfoot,Vector((1,1,1)))
    env['bpy'].context.view_layer.update()
    for n in names:bases[0,clip.names.index(n)]=np.array(actor.pose.bones[n].matrix_basis)
    frames.append(bases)
    if round(t*24)%48==0:print('RIGHT_PATH',float(t),flush=True)
np.savez_compressed(env['OUT']/'contact-poses.npz',times=clip.times,basis=frames,names=clip.names)
(env['OUT']/'right-path.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'supportInterval':[2.5,13.5],'closingInterval':[13.5,16],'status':'candidate requiring collision and visual review'},indent=2))
