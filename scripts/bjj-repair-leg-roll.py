"""Repair leg roll while retaining fitted hips, ankles and limb lengths.

Produces a solver seed, not a contact-approved animation. A posted foot retains
its surface orientation; its knee follows the foot's lateral axis. Free feet
stay in the anatomical bend plane instead of retaining the old inverted roll.
"""
import os,runpy,numpy as np
from pathlib import Path
from mathutils import Matrix
root=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(root/'scripts/bjj-build-triangle.py'),run_name='definitions')
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
clip=Clip(os.environ['BJJ_CONTACT_CLIP']);times=np.arange(529)/24;frames=[];maximum_joint_error=0
feet_only=os.environ.get('BJJ_FIX_FEET_ONLY')=='1'
repair_post=os.environ.get('BJJ_REPAIR_POST_FRAME')=='1'
for t in times:
    bases=clip.sample(t)
    for p,(actor,_) in enumerate(env['actors']):
        for i,name in enumerate(clip.names):actor.pose.bones[name].matrix_basis=Matrix(bases[p,i].tolist())
    env['bpy'].context.view_layer.update()
    for actor,_ in env['actors']:
        for side in ['L','R']:
            names=[part+'.'+side for part in ['upperleg01','upperleg02','lowerleg01','lowerleg02','foot']]
            positions=[env['point'](actor,name) for name in names]
            foot=actor.pose.bones[names[-1]].matrix.copy()
            side_blend=env['hip_post_blend'](t) if actor is env['actors'][0][0] and side=='R' else 0
            if side_blend>0 and not feet_only and not repair_post:
                hip,_,knee,_,ankle=positions
                axis=(ankle-hip).normalized();d=(ankle-hip).length
                lateral=foot.to_3x3()@actor.data.bones[names[-1]].matrix_local.to_3x3().transposed()@env['Vector']((1,0,0))
                lateral-=axis*lateral.dot(axis);lateral.normalize()
                current=(knee-hip);current-=axis*current.dot(axis);current.normalize()
                desired=axis.cross(lateral).normalized()
                bend=current.lerp(desired,side_blend).normalized()
                lengths=[actor.data.bones[n].length for n in names[:4]]
                l1,l2=sum(lengths[:2]),sum(lengths[2:]);along=(l1*l1-l2*l2+d*d)/(2*d)
                knee=hip+axis*along+bend*max(0,l1*l1-along*along)**.5
                positions=[hip,hip+(knee-hip)*lengths[0]/l1,knee,knee+(ankle-knee)*lengths[2]/l2,ankle]
            normal=(positions[2]-positions[0]).cross(positions[4]-positions[2]).normalized()
            if not feet_only:
                for name,head,tail in zip(names[:4],positions,positions[1:]):
                    env['set_leg_bone'](actor,name,head,tail,normal)
                    env['bpy'].context.view_layer.update()
            if actor is env['actors'][0][0]:
                # The old foot aim carried the same unbounded axial roll as
                # the shin. Keep toe direction, repair that roll outside posts.
                env['set_foot_bone'](actor,side,positions[-1],positions[-1]+foot.to_3x3().col[1],normal)
                env['bpy'].context.view_layer.update()
                repaired=actor.pose.bones[names[-1]].matrix.to_quaternion()
                actor.pose.bones[names[-1]].matrix=Matrix.LocRotScale(positions[-1],repaired.slerp(foot.to_quaternion(),side_blend),foot.to_scale())
                if repair_post and side_blend>0:
                    # Rebuild the tangent direction too. Keeping an old post's
                    # sole normal while retaining its old yaw can leave the
                    # foot's lateral axis almost parallel to the shin.
                    origin_ankle=positions[-1].copy();origin_pole=positions[2].copy()
                    for _ in range(2):
                        post=env['foot_contact'](side,env['point'](actor,names[2]),env['point'](actor,names[4]))
                        target=origin_ankle.lerp(post[0],side_blend)
                        hip=env['point'](actor,names[0]);axis=(target-hip).normalized()
                        lateral=post[1].to_matrix()@actor.data.bones[names[4]].matrix_local.to_3x3().transposed()@env['Vector']((1,0,0))
                        lateral-=axis*lateral.dot(axis);lateral.normalize()
                        pole=origin_pole.lerp(hip+(target-hip)*.5+axis.cross(lateral)*.5,side_blend)
                        end,knee=env['chain'](actor,side,'leg',env['canonical'](target),env['canonical'](pole),Matrix.Identity(4))
                        actor.pose.bones[names[4]].matrix=Matrix.LocRotScale(end,repaired.slerp(post[1],side_blend),foot.to_scale())
                        env['bpy'].context.view_layer.update()
                    lengths=[actor.data.bones[n].length for n in names[:4]];l1,l2=sum(lengths[:2]),sum(lengths[2:])
                    positions=[hip,hip+(knee-hip)*lengths[0]/l1,knee,knee+(end-knee)*lengths[2]/l2,end]
            else:actor.pose.bones[names[-1]].matrix=foot
            env['bpy'].context.view_layer.update()
            maximum_joint_error=max(maximum_joint_error,max((env['point'](actor,n)-v).length for n,v in zip(names,positions)))
    frames.append(np.array([[np.array(actor.pose.bones[n].matrix_basis) for n in clip.names] for actor,_ in env['actors']]))
    if round(t*24)%48==0:print('LEG_ROLL_SEED',round(t,3),flush=True)
assert maximum_joint_error<.00003,maximum_joint_error
out=env['OUT'];np.savez_compressed(out/'contact-poses.npz',times=times,basis=frames,names=clip.names)
print('LEG_ROLL_SEED_DONE','maximumJointErrorMeters',maximum_joint_error,flush=True)
