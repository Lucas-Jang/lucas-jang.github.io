"""Repair a demonstrator leg's anatomical roll in the displayed clip.

Preserves both actors' joint centres and every other limb's original pose.
The raised foot follows its shin instead of retaining the old inverted roll.
"""
import os,runpy,numpy as np,json,hashlib,math
from pathlib import Path
from mathutils import Matrix,Vector
root=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(root/'scripts/bjj-build-triangle.py'),run_name='definitions')
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
source=Path(os.environ['BJJ_CONTACT_CLIP']);clip=Clip(source)
side=os.environ.get('BJJ_FIX_SIDE','R')
names=[f'{n}.{side}' for n in ['upperleg01','upperleg02','lowerleg01','lowerleg02','foot']]
times=np.arange(529)/24;frames=[];maximum_joint_error=0
for t in times:
    original=clip.sample(t)
    for p,(actor,_) in enumerate(env['actors']):
        for i,name in enumerate(clip.names):actor.pose.bones[name].matrix_basis=Matrix(original[p,i].tolist())
    env['bpy'].context.view_layer.update();actor=env['actors'][0][0]
    positions=[env['point'](actor,name) for name in names]
    closing=env['smooth'](13.5,16,t) if side=='R' and os.environ.get('BJJ_RIGHT_CLOSE_SEED')=='1' else 0
    if closing:
        hip=positions[0];left=env['point'](actor,'foot.L')
        length=sum(actor.data.bones[n].length for n in names[:2]);shinlength=sum(actor.data.bones[n].length for n in names[2:4])
        upper=(left-hip).normalized();knee=hip+upper*length
        outward=Vector((-1,0,0));outward-=upper*outward.dot(upper);outward.normalize()
        lower=upper*math.cos(math.radians(120))+outward*math.sin(math.radians(120))
        end=knee+lower*shinlength
        env['chain'](actor,'R','leg',env['canonical'](positions[-1].lerp(end,closing)),env['canonical'](positions[2].lerp(knee,closing)),Matrix.Identity(4))
        positions=[env['point'](actor,name) for name in names]
    foot=actor.pose.bones['foot.'+side].matrix.copy()
    normal=(positions[2]-positions[0]).cross(positions[4]-positions[2]).normalized()
    for name,head,tail in zip(names[:4],positions,positions[1:]):
        env['set_leg_bone'](actor,name,head,tail,normal);env['bpy'].context.view_layer.update()
    env['set_foot_bone'](actor,side,positions[-1],positions[-1]+normal,normal)
    env['bpy'].context.view_layer.update();raised=actor.pose.bones['foot.'+side].matrix.to_quaternion()
    blend=env['smooth'](4,4.5,t)
    actor.pose.bones['foot.'+side].matrix=Matrix.LocRotScale(positions[-1],foot.to_quaternion().slerp(raised,blend),Vector((1,1,1)))
    env['bpy'].context.view_layer.update()
    maximum_joint_error=max(maximum_joint_error,max((env['point'](actor,n)-v).length for n,v in zip(names,positions)))
    result=original.copy()
    for name in names:result[0,clip.names.index(name)]=np.array(actor.pose.bones[name].matrix_basis)
    frames.append(result)
assert maximum_joint_error<.00003,maximum_joint_error
out=env['OUT'];np.savez_compressed(out/'contact-poses.npz',times=times,basis=frames,names=clip.names)
(out/f'{"right" if side=="R" else "left"}-leg-repair.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'scope':f'demonstrator {side} thigh/shin roll; raised ankle orientation','footTransitionSeconds':[4,4.5],'maximumAimReconstructionErrorMeters':maximum_joint_error,'jointCentresPreserved':not(side=='R' and os.environ.get('BJJ_RIGHT_CLOSE_SEED')=='1'),'otherBoneBasesPreserved':True},indent=2),encoding='utf8')
print('LEG_REPAIRED',side,'jointCentreChange',maximum_joint_error,flush=True)
