"""Fast actual-skin inspection of one authored or corrected pose."""
import bpy,runpy,os,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(root/'scripts/bjj-build-triangle.py'),run_name='bjj_definitions')
t=float(os.environ.get('BJJ_POSE_TIME','22'));env['pose_at'](t)
refined=os.environ.get('BJJ_REVIEW_REFINED')=='1'
if refined:
    Clip=runpy.run_path(str(root/'scripts/bjj-contact-sample.py'))['ContactClip']
    clip=Clip(Path(os.environ.get('BJJ_CONTACT_CLIP',str(env['OUT']/'contact-poses.npz'))));basis=clip.sample(t)
    for p,(actor,_) in enumerate(env['actors']):
        for k,name in enumerate(clip.names):actor.pose.bones[name].matrix_basis=Matrix(basis[p,k].tolist())
bpy.context.view_layer.update()
scene=bpy.context.scene
detail=os.environ.get('BJJ_REVIEW_DETAIL')
centre=Vector((-.25,0,.4))
if detail:
    actor=env['actors'][0][0];centre=actor.pose.bones['wrist.'+detail].head.copy()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));floor=bpy.context.object;floor.data.materials.append(env['mat']('Floor',(.15,.20,.23)))
for loc,power,size in [((-3,-4,6),650,5),((3,1,4),450,4)]:
    light=bpy.data.lights.new('Review','AREA');light.energy=power;light.size=size;ob=bpy.data.objects.new('Review',light);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((-.25,0,.5))-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=.42 if detail else 2.2;scene.camera=camera
scene.world.color=(.3,.3,.3);scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=800;scene.render.resolution_y=600;scene.render.resolution_percentage=100
locations=[centre+Vector(v) for v in [(1,-1,1),(-1,1,1),(1,1,-.3)]] if detail else [(-2.5,-3,2.5),(-.2,0,4),(2.5,3,1.6)]
for i,loc in enumerate(locations):
    camera.location=loc;camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(env['OUT']/f'{"corrected" if refined else "authored"}-{t:g}{"-hand"+detail if detail else ""}-{i}.png');bpy.ops.render.render(write_still=True)
