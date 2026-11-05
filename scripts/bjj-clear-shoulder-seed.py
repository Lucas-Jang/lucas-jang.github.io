"""Lift the choking leg over the shoulder before lowering it behind the neck.

Transfers the authored support-preserving body roll and ankle/knee displacement
to a fitted guide without stretching leg lengths. Requires contact review.
"""
import os,runpy,json,numpy as np
from pathlib import Path
from mathutils import Matrix
root=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(root/'scripts/bjj-build-triangle.py'),run_name='definitions');g=env['pose_at'].__globals__
Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip'];clip=Clip(os.environ['BJJ_CONTACT_CLIP'])
times=np.arange(529)/24;frames=[];clearance=g['OVERHEAD_CLEARANCE']
hip_roll=g['HIP_ROLL'];baseline_hip_roll=json.loads(Path(os.environ['BJJ_BASE_HIP_ROLL']).read_text(encoding='utf8')) if os.environ.get('BJJ_BASE_HIP_ROLL') else hip_roll
for t in times:
    bases=clip.sample(t)
    if 3<t<6:
        samples=[]
        for value,roll in [(0,baseline_hip_roll),(clearance,hip_roll)]:
            g['OVERHEAD_CLEARANCE']=value;g['EXTEND_LEG_RETRACTION']=bool(value);g['HIP_ROLL']=roll;env['pose_at'](t);a=env['actors'][0][0]
            samples.append(([env['point'](a,n) for n in ['lowerleg01.L','foot.L','lowerarm01.L','wrist.L','lowerarm01.R','wrist.R']],np.array([[np.array(actor.pose.bones[n].matrix_basis) for n in clip.names] for actor,_ in env['actors']]),[a.pose.bones['wrist.'+side].matrix.copy() for side in ['L','R']]))
        for p,(actor,_) in enumerate(env['actors']):
            for i,n in enumerate(clip.names):actor.pose.bones[n].matrix_basis=Matrix(bases[p,i].tolist())
        env['bpy'].context.view_layer.update();a=env['actors'][0][0]
        knee=env['point'](a,'lowerleg01.L')+samples[1][0][0]-samples[0][0][0]
        ankle=env['point'](a,'foot.L')+samples[1][0][1]-samples[0][0][1]
        old_arms=[(env['point'](a,'lowerarm01.'+side),a.pose.bones['wrist.'+side].matrix.copy()) for side in ['L','R']]
        for p,(actor,_) in enumerate(env['actors']):
            for i,n in enumerate(clip.names):
                if p==0 and n.endswith('.L') and n.startswith(('upperleg','lowerleg','foot.')):continue
                if p==0 and n.startswith(('upperarm','lowerarm','wrist.')):continue
                before,after=samples[0][1][p,i],samples[1][1][p,i]
                bases[p,i,:3,:3]=after[:3,:3]@before[:3,:3].T@bases[p,i,:3,:3]
                bases[p,i,:3,3]+=after[:3,3]-before[:3,3]
                actor.pose.bones[n].matrix_basis=Matrix(bases[p,i].tolist())
        env['bpy'].context.view_layer.update()
        end,knee=env['chain'](a,'L','leg',env['canonical'](ankle),env['canonical'](knee),Matrix.Identity(4))
        normal=(knee-env['point'](a,'upperleg01.L')).cross(end-knee).normalized()
        env['set_foot_bone'](a,'L',end,end+normal,normal)
        env['bpy'].context.view_layer.update()
        reference=a.pose.bones['spine01'].matrix@a.data.bones['spine01'].matrix_local.inverted()
        for k,side in enumerate(['L','R']):
            elbow=old_arms[k][0]+samples[1][0][2+2*k]-samples[0][0][2+2*k]
            target=old_arms[k][1].translation+samples[1][0][3+2*k]-samples[0][0][3+2*k]
            rotation=samples[1][2][k].to_3x3()@samples[0][2][k].to_3x3().transposed()@old_arms[k][1].to_3x3()
            if side=='R' and t<=5.5:
                grip=env['hand_contact'](0,'R',1,'lowerarm','L',reference,.80)
                target=grip[0];rotation=grip[1].to_matrix()
            env['chain'](a,side,'arm',env['canonical'](target),env['canonical'](elbow),reference)
            a.pose.bones['wrist.'+side].matrix=Matrix.LocRotScale(env['point'](a,'wrist.'+side),rotation.to_quaternion(),env['Vector']((1,1,1)))
            env['bpy'].context.view_layer.update()
        bases=np.array([[np.array(actor.pose.bones[n].matrix_basis) for n in clip.names] for actor,_ in env['actors']])
    frames.append(bases)
g['OVERHEAD_CLEARANCE']=clearance;g['EXTEND_LEG_RETRACTION']=True;g['HIP_ROLL']=hip_roll
np.savez_compressed(env['OUT']/'contact-poses.npz',times=times,basis=frames,names=clip.names)
print('SHOULDER_CLEARANCE_SEED',clearance,flush=True)
