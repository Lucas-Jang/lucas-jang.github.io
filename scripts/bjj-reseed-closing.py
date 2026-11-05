"""Connect hip support to a checked paired lock in anatomical lateral space."""
import os,runpy,numpy as np,json
from pathlib import Path
from mathutils import Matrix,Vector
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(ROOT/'scripts/bjj-build-triangle.py'),run_name='definitions')
Clip=runpy.run_path(str(ROOT/'scripts/bjj-contact-sample.py'))['ContactClip']
guide=Clip(ROOT/'.astro/bjj-both-leg-seed/contact-poses.npz');lock=Clip(Path(os.environ.get('BJJ_LOCK_CLIP',str(ROOT/'.astro/bjj-true-lock-preflight/contact-poses.npz'))))
actor=env['actors'][0][0]
longnames=lambda side:[f'{n}.{side}' for n in ['upperleg01','upperleg02','lowerleg01','lowerleg02']]
legs=[n for n in guide.names if n.endswith(('.L','.R')) and n.startswith(('upperleg','lowerleg','foot.','toe'))]
def assign(bases):
    for p,(a,_) in enumerate(env['actors']):
        for i,n in enumerate(guide.names):a.pose.bones[n].matrix_basis=Matrix(bases[p,i].tolist())
    env['bpy'].context.view_layer.update()
def capture():
    return {side:{'points':[env['point'](actor,n) for n in longnames(side)+['foot.'+side]],'rotations':[actor.pose.bones[n].matrix.to_quaternion() for n in longnames(side)],'foot':actor.pose.bones['foot.'+side].matrix.to_quaternion()} for side in ['L','R']}
start=guide.sample(13.5);final=lock.sample(16)
assign(start);before=capture()
outward=(env['point'](actor,'upperleg01.R')-env['point'](actor,'upperleg01.L')).normalized()
assign(final);after=capture();frames=[]
for t in guide.times:
    bases=guide.sample(t)
    if 13.5<t<16:
        f=env['smooth'](13.5,16,t);assign(bases)
        for side in ['L','R']:
            a,b=before[side],after[side]
            if side=='L':end=a['points'][-1].lerp(b['points'][-1],f);hint=a['points'][2].lerp(b['points'][2],f)
            else:
                p0=a['points'][-1];p3=b['points'][-1];p1=p0+outward*.23+Vector((0,0,.12));p2=p3+outward*.12+Vector((0,0,.08))
                end=p0*(1-f)**3+p1*(3*(1-f)**2*f)+p2*(3*(1-f)*f*f)+p3*f**3
                hint=a['points'][2].lerp(b['points'][2],f)+outward*(.10*np.sin(np.pi*f))
            env['chain'](actor,side,'leg',env['canonical'](end),env['canonical'](hint),Matrix.Identity(4))
            points=[env['point'](actor,n) for n in longnames(side)+['foot.'+side]]
            # Retain the supported pose's axial roll at lift-off, then move
            # smoothly to the anatomical bend-plane frame without a twist pop.
            for i,n in enumerate(longnames(side)):
                direction=(points[i+1]-points[i]).normalized();old=(a['points'][i+1]-a['points'][i]).normalized()
                transported=old.rotation_difference(direction)@a['rotations'][i]
                aimed=actor.pose.bones[n].matrix.to_quaternion()
                q=transported.slerp(aimed,env['smooth'](13.5,14.2,t))
                actor.pose.bones[n].matrix=Matrix.LocRotScale(points[i],q,Vector((1,1,1)));env['bpy'].context.view_layer.update()
            if side=='R':
                normal=(points[2]-points[0]).cross(points[-1]-points[2]).normalized()
                env['set_foot_bone'](actor,side,points[-1],points[-1]+normal,normal)
                free=actor.pose.bones['foot.R'].matrix.to_quaternion()
                q=a['foot'].slerp(free,env['smooth'](0,.25,f)).slerp(b['foot'],env['smooth'](.75,1,f))
            else:q=a['foot'].slerp(b['foot'],f)
            actor.pose.bones['foot.'+side].matrix=Matrix.LocRotScale(points[-1],q,Vector((1,1,1)))
        env['bpy'].context.view_layer.update()
        for n in legs:
            i=guide.names.index(n)
            if n.startswith('toe'):
                v=Rotation.from_matrix(start[0,i,:3,:3].T@final[0,i,:3,:3]).as_rotvec()
                bases[0,i,:3,:3]=start[0,i,:3,:3]@Rotation.from_rotvec(v*f).as_matrix()
            else:bases[0,i]=np.array(actor.pose.bones[n].matrix_basis)
        finish=env['smooth'](15.5,16,t)
        if finish:
            ids=[guide.names.index(n) for n in legs]
            delta=Rotation.from_matrix(np.swapaxes(bases[0,ids,:3,:3],1,2)@final[0,ids,:3,:3]).as_rotvec()
            bases[0,ids,:3,:3]=bases[0,ids,:3,:3]@Rotation.from_rotvec(delta*finish).as_matrix()
    elif t>=16:
        for n in legs:bases[0,guide.names.index(n)]=final[0,guide.names.index(n)]
    frames.append(bases)
np.savez_compressed(env['OUT']/'contact-poses.npz',times=guide.times,basis=frames,names=guide.names)
(env['OUT']/'closing-path.json').write_text(json.dumps({'interval':[13.5,16],'outwardFromAnatomicalHips':list(outward),'terminalPose':'checked paired lock; both legs anatomically aligned','status':'guide; requires sampled surface validation'},indent=2))
