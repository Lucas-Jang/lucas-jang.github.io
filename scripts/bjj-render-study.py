"""Render the saved authoring scene, including the complete moving skin mesh."""
import bpy,math,os
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent.parent
out=Path(os.environ.get('BJJ_AUTHORING_OUT',str(root/'.astro/bjj-rebuild'))).resolve()
bpy.ops.wm.open_mainfile(filepath=str(out/'triangle-authoring.blend'))
scene=bpy.context.scene;camera=scene.camera
def view(location):
    camera.location=location;camera.rotation_euler=(Vector((-.22,0,.48))-camera.location).to_track_quat('-Z','Y').to_euler()
mode=os.environ.get('BJJ_REVIEW_MODE','stills')
if mode=='video':
    scene.render.engine='BLENDER_WORKBENCH'
    scene.display.shading.light='STUDIO';scene.display.shading.color_type='VERTEX'
    scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True
    scene.display.shading.cavity_type='BOTH';scene.display.shading.background_type='WORLD'
    scene.world.color=(.23,.28,.31)
    for obj in scene.objects:
        if obj.type=='MESH' and not obj.data.color_attributes:
            attr=obj.data.color_attributes.new(name='ReviewTint',type='FLOAT_COLOR',domain='POINT')
            color=obj.data.materials[0].diffuse_color if obj.data.materials else (.4,.4,.4,1)
            for value in attr.data:value.color=color
    scene.render.resolution_x=720;scene.render.resolution_y=540
    frames=out/'video-frames';frames.mkdir(exist_ok=True)
    view((-2.5,-3,2.5))
    for index,frame in enumerate(range(1,scene.frame_end+1,2)):
        scene.frame_set(frame);scene.render.filepath=str(frames/f'{index:04}.png');bpy.ops.render.render(write_still=True)
        if index%24==0:print('VIDEO_FRAME',index,flush=True)
else:
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    for number,location in enumerate([(-2.5,-3,2.5),(2.5,-3,1.7),(2.5,3,2),(-.2,0,4)]):
        view(location)
        for second in [0,4,8,12,16,22]:
            scene.frame_set(second*24+1);scene.render.filepath=str(out/f'view-{number}-{second:02}.png');bpy.ops.render.render(write_still=True)
print('REVIEW_RENDER_DONE',flush=True)
