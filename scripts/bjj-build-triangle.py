"""Paired, editable Blender animation study. No legacy pose/bake data is imported.

Run with Blender 4.5: blender -b --factory-startup -P scripts/bjj-build-triangle.py
Outputs an authoring .blend, a skinned GLB and rendered review images under .astro.
The motion is authored, not motion capture; source provenance is kept separately.
"""
import bpy, json, math, os
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/bjj/source'
OUT = ROOT / '.astro/bjj-rebuild'
OUT.mkdir(parents=True, exist_ok=True)
FPS, DURATION = 24, 22
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

rig_data = json.loads((SOURCE/'default.mhskel').read_text(encoding='utf8'))
weight_data = json.loads((SOURCE/'default_weights.mhw').read_text(encoding='utf8'))['weights']
verts, faces, group = [], [], ''
for line in (SOURCE/'base.obj').read_text(encoding='utf8').splitlines():
    items = line.split()
    if not items: continue
    if items[0] == 'v': verts.append(Vector(map(float,items[1:4])))
    if items[0] == 'g': group = items[1]
    if items[0] == 'f' and group == 'body': faces.append([int(x.split('/')[0])-1 for x in items[1:]])
for line in (SOURCE/'adult-male.target').read_text(encoding='utf8').splitlines():
    items=line.split()
    if items and not items[0].startswith('#'):
        verts[int(items[0])] += Vector(map(float,items[1:4]))

def joint(name):
    indices = rig_data['joints'][name]
    if isinstance(indices,int): indices=[indices]
    return sum((verts[i] for i in indices),Vector()) / len(indices)

origin=joint('root____tail')
used=sorted(set(i for face in faces for i in face))
height=max(verts[i].y for i in used)-min(verts[i].y for i in used)
SCALE=1.78/height
# Canonical authoring space is Y-up, +Z forward; Blender uses Z-up, -Y forward.
def C(v): return Vector((v[0],-v[2],v[1]))
def rest(v): return C((v-origin)*SCALE)
rest_verts=[rest(v) for v in verts]
rest_joints={k:rest(joint(k)) for k in rig_data['joints']}

def mat(name,color,roughness=.65):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness
    return m
skin=mat('Skin',(.56,.34,.23),.55)
white=mat('Ivory training suit',(.84,.86,.81),.85)
blue=mat('Indigo training suit',(.045,.17,.32),.85)
dark=mat('Suit seams',(.025,.043,.055),.8)
eye_white=mat('Eye whites',(.75,.72,.65),.5)
iris=mat('Iris',(.034,.028,.021),.4)

def make_actor(name,cloth):
    arm=bpy.data.armatures.new(name+' skeleton');obj=bpy.data.objects.new(name,arm);bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for key,desc in rig_data['bones'].items():
        b=arm.edit_bones.new(key);b.head=rest_joints[desc['head']];b.tail=rest_joints[desc['tail']]
        if (b.tail-b.head).length<1e-5:b.tail=b.head+Vector((0,0,.005))
        plane=rig_data['planes'][desc['rotation_plane']]
        a,c,d=[rest_joints[p] for p in plane]
        normal=(c-a).cross(d-a)
        if normal.length>1e-6:b.align_roll(normal.normalized())
    for key,desc in rig_data['bones'].items():
        if desc['parent']:arm.edit_bones[key].parent=arm.edit_bones[desc['parent']]
    bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False)
    remap={old:new for new,old in enumerate(used)}
    data=bpy.data.meshes.new(name+' surface');data.from_pydata([rest_verts[i] for i in used],[],[[remap[i] for i in f] for f in faces]);data.update()
    mesh=bpy.data.objects.new(name+' training suit',data);bpy.context.collection.objects.link(mesh)
    mesh.data.materials.append(skin);mesh.data.materials.append(cloth);mesh.data.materials.append(dark)
    for bone,values in weight_data.items():
        vg=mesh.vertex_groups.new(name=bone)
        for i,w in values:
            if i in remap:vg.add([remap[i]],w,'REPLACE')
    # Tight training suit uses the continuous human surface, not separate limb tubes.
    # No gi collar or cloth simulation is implied by this prototype.
    neck_height=joint('neck01____head').y
    for poly,face in zip(data.polygons,faces):
        centre=sum((verts[i] for i in face),Vector())/len(face)
        groups={g.group for i in poly.vertices for g in data.vertices[i].groups if g.weight>.15}
        names={mesh.vertex_groups[g].name for g in groups}
        exposed=centre.y>neck_height-.15 or any(n.startswith(('wrist','finger','foot','toe')) for n in names)
        poly.material_index=0 if exposed else 1
        poly.use_smooth=True
    # Interpolate the colour boundary over vertices instead of assigning jagged
    # skin-coloured polygon islands at the neck and wrists.
    tint=mat(name+' suit and skin',(1,1,1),.75)
    node=tint.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='BodyTint'
    tint.node_tree.links.new(node.outputs['Color'],tint.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    data.materials.clear();data.materials.append(tint)
    colours=data.color_attributes.new(name='BodyTint',type='FLOAT_COLOR',domain='POINT')
    for vtx,old in zip(data.vertices,used):
        headfactor=max(0,min(1,(verts[old].y-neck_height+.30)/.35));headfactor=headfactor*headfactor*(3-2*headfactor)
        distal=sum(g.weight for g in vtx.groups if mesh.vertex_groups[g.group].name.startswith(('wrist','finger','foot','toe')))
        factor=max(headfactor,max(0,min(1,(distal-.15)/.65)))
        colours.data[vtx.index].color=tuple(cloth.diffuse_color[i]*(1-factor)+skin.diffuse_color[i]*factor for i in range(3))+(1,)
    for poly in data.polygons:poly.material_index=0
    mod=mesh.modifiers.new('Skin deformation','ARMATURE');mod.object=obj;mod.use_deform_preserve_volume=False
    mesh.parent=obj
    # Real eyeballs prevent the empty socket appearance of a bare basemesh.
    for side in ['L','R']:
        centre=rest_joints[f'eye.{side}____head']
        for label,radius,offset,material in [('eye',.011,0,eye_white),('iris',.005,.010,iris)]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=radius,location=centre+Vector((0,-offset,0)))
            ball=bpy.context.object;ball.name=f'{name} {side} {label}';ball.data.materials.append(material)
            # Bone parenting without changing the rest position.
            restmatrix=obj.data.bones[f'eye.{side}'].matrix_local
            ball.parent=obj;ball.parent_type='BONE';ball.parent_bone=f'eye.{side}'
            ball.matrix_parent_inverse=(restmatrix @ Matrix.Translation((0,obj.data.bones[f'eye.{side}'].length,0))).inverted()
            for p in ball.data.polygons:p.use_smooth=True
    for b in obj.pose.bones:b.rotation_mode='QUATERNION'
    return obj,mesh

actors=[make_actor('Demonstrator',white),make_actor('Partner',blue)]

def basis(up,forward):
    y=Vector(up).normalized();z=Vector(forward);z=(z-y*z.dot(y)).normalized();x=y.cross(z).normalized()
    canonical=Matrix((x,y,z)).transposed()
    conversion=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
    return conversion@canonical@conversion.transposed()

def root_matrix(hip,up,forward):return Matrix.LocRotScale(C(hip),basis(up,forward).to_quaternion(),Vector((1,1,1)))

def point(actor,name):
    bpy.context.view_layer.update()
    return actor.pose.bones[name].head.copy()

def set_bone(actor,name,head,tail,reference):
    b=actor.pose.bones[name];rb=actor.data.bones[name]
    original=(reference.to_3x3()@(rb.tail_local-rb.head_local)).normalized()
    direction=(tail-head).normalized()
    q=original.rotation_difference(direction)@reference.to_quaternion()@rb.matrix_local.to_quaternion()
    b.matrix=Matrix.LocRotScale(head,q,Vector((1,1,1)))

def chain(actor,side,kind,target,pole,reference):
    names=([f'upperleg01.{side}',f'upperleg02.{side}',f'lowerleg01.{side}',f'lowerleg02.{side}'] if kind=='leg' else [f'upperarm01.{side}',f'upperarm02.{side}',f'lowerarm01.{side}',f'lowerarm02.{side}'])
    start=point(actor,names[0]);end=C(target);hint=C(pole)
    lengths=[actor.data.bones[n].length for n in names];l1=sum(lengths[:2]);l2=sum(lengths[2:])
    d=(end-start).length;d=min(l1+l2-.002,max(abs(l1-l2)+.002,d));axis=(end-start).normalized();end=start+axis*d
    along=(l1*l1-l2*l2+d*d)/(2*d);centre=start+axis*along;perp=hint-centre;perp-=axis*perp.dot(axis)
    if perp.length<1e-5:perp=axis.cross(Vector((0,0,1)))
    knee=centre+perp.normalized()*math.sqrt(max(0,l1*l1-along*along))
    mid1=start+(knee-start)*(lengths[0]/l1);mid2=knee+(end-knee)*(lengths[2]/l2)
    points=[start,mid1,knee,mid2,end]
    for n,a,b in zip(names,points,points[1:]):
        set_bone(actor,n,a,b,reference);bpy.context.view_layer.update()
    return end,knee

def body_pose(actor,desc):
    for b in actor.pose.bones:b.matrix_basis=Matrix.Identity(4)
    reference=root_matrix(desc['hip'],desc['up'],desc['forward'])
    actor.pose.bones['root'].matrix=reference@actor.data.bones['root'].matrix_local
    # Curvature is distributed through the lumbar and thoracic spine.
    for i,name in enumerate(['spine05','spine04','spine03','spine02','spine01']):
        b=actor.pose.bones[name];axis=actor.data.bones[name].matrix_local.to_3x3().inverted()@Vector((1,0,0));b.rotation_quaternion=Quaternion(axis,math.radians(desc.get('bend',0))/5)
    for name in ['neck01','neck02','neck03']:
        axis=actor.data.bones[name].matrix_local.to_3x3().inverted()@Vector((1,0,0))
        actor.pose.bones[name].rotation_quaternion=Quaternion(axis,math.radians(desc.get('neck',0))/3)
    bpy.context.view_layer.update()
    return reference

# Paired blocking poses. Actual contact targets are evaluated against the partner
# below, after both torsos have been posed, so a grip follows the moving surface.
# This file is an editable motion study, not a technique-certified final asset.
KEYS=[
 # t, hip A, turn A, hip B, lean B, left foot A, right foot A
 (0,[-.44,.15,0],0,[.32,.53,0],-12,[.35,.65,-.26],[.35,.65,.26]),
 (2,[-.43,.16,0],0,[.31,.53,0],-17,[.35,.65,-.26],[.31,.48,.22]),
 (4,[-.38,.22,0],0,[.29,.52,0],-27,[.15,1.14,-.24],[.31,.48,.22]),
 (6,[-.28,.32,0],0,[.28,.51,0],-60,[-.20,.82,.25],[-.22,.87,-.24]),
 (8,[-.28,.31,0],0,[.28,.50,0],-65,[-.22,.80,.25],[-.24,.83,-.24]),
 (10,[-.28,.31,.04],10,[.28,.50,0],-65,[-.24,.79,.25],[.15,.46,.25]),
 (12,[-.26,.32,.08],24,[.26,.50,0],-68,[-.24,.77,.25],[.15,.46,.25]),
 (14,[-.25,.33,.10],42,[.25,.50,0],-70,[-.25,.75,.25],[-.30,1.02,-.15]),
 (16,[-.25,.33,.10],48,[.25,.50,0],-71,[-.25,.74,.25],[-.35,.49,.01]),
 (19,[-.25,.33,.10],48,[.25,.50,0],-72,[-.25,.74,.25],[-.35,.49,.01]),
 (22,[-.25,.33,.10],48,[.25,.50,0],-72,[-.25,.74,.25],[-.35,.49,.01]),
]

def interpolate(t):
    i=next((i for i in range(len(KEYS)-1) if t<=KEYS[i+1][0]),len(KEYS)-2)
    a,b=KEYS[i:i+2];s=max(0,min(1,(t-a[0])/(b[0]-a[0])));s=s*s*(3-2*s)
    return [t]+[(Vector(x).lerp(Vector(y),s) if isinstance(x,list) else x+(y-x)*s) for x,y in zip(a[1:],b[1:])]

def pose_at(t):
    _,hip,angle,bhip,lean,footL,footR=interpolate(t)
    theta=math.radians(angle);a_up=[-math.cos(theta),-.30*min(1,t/6),math.sin(theta)];a_fwd=[0,1,0]
    lean=math.radians(lean)
    a,b=[pair[0] for pair in actors]
    ra=body_pose(a,dict(hip=hip,up=a_up,forward=a_fwd,bend=4-8*min(1,t/6),neck=-3))
    rb=body_pose(b,dict(hip=bhip,up=[math.sin(lean),math.cos(lean),0],forward=[-math.cos(lean),math.sin(lean),0],bend=8,neck=-8))
    # Partner's knees remain planted. The ankles follow the shin and mat, rather
    # than drifting as the torso leans. Canonical +/- Z distinguish their sides.
    for side,z in [('L',.22),('R',-.22)]:
        end,knee=chain(b,side,'leg',[.78,.075,z],[.16,.04,z],rb)
        pb=b.pose.bones[f'foot.{side}'];start=point(b,f'foot.{side}')
        set_bone(b,f'foot.{side}',start,start+C([.16,-.01,0]),rb)
    # The left thigh goes outside the shoulder; the second leg repositions and
    # folds over it after the hip-angle phase. Knees retain anatomical identity.
    a_knees=[[-.38,.72,-.18],[-.08,.77,.36]]
    lock=max(0,min(1,(t-12)/4))
    a_knees[1]=Vector(a_knees[1]).lerp(Vector([-.20,.70,.36]),lock)
    for side,target,pole in [('L',footL,a_knees[0]),('R',footR,a_knees[1])]:
        end,knee=chain(a,side,'leg',target,pole,ra)
        # Dorsiflexion is authored explicitly; a foot is not a symmetric oval.
        start=point(a,f'foot.{side}')
        toe=C([-.08,.10,.03 if side=='L' else -.03])
        if side=='R':toe=toe.lerp(C([.02,.01,-.14]),max(0,min(1,(t-12)/4)))
        set_bone(a,f'foot.{side}',start,start+toe,ra)
    # Paired wrist-control anchor, then shin control and posture control.
    anchor=Vector([-.43,.49,-.20])
    trapped=max(0,min(1,(t-4)/2))
    b_left=Vector([-.40,.49,-.20]).lerp(Vector([-.50,.52,-.12]),trapped)
    b_right=Vector([.12,.18,-.40])
    for side,target,pole in [('L',b_left,[-.45,.51,.10]),('R',b_right,[.05,.38,-.45])]:chain(b,side,'arm',target,pole,rb)
    wrist=point(b,'wrist.L');wristcanonical=Vector((wrist.x,wrist.z,-wrist.y))
    shinpoint=point(a,'lowerleg02.L');shinpoint=Vector((shinpoint.x,shinpoint.z,-shinpoint.y))
    head=point(b,'head');head=Vector((head.x,head.z,-head.y))
    ashoulders=[point(a,f'upperarm01.{side}') for side in ['L','R']]
    ashoulders=[Vector((v.x,v.z,-v.y)) for v in ashoulders]
    release=max(0,min(1,(t-6)/2));left=wristcanonical.lerp(shinpoint+(ashoulders[0]-shinpoint).normalized()*.13,release)
    right=Vector([-.39,.47,.22]).lerp(head+(ashoulders[1]-head).normalized()*.15,max(0,min(1,(t-14)/3)))
    for side,target,pole in [('L',left,[-.64,.36,-.40]),('R',right,[-.68,.35,.43])]:
        chain(a,side,'arm',target,pole,ra)
        contact=shinpoint if side=='L' else head+Vector([0,.06,0])
        name=f'wrist.{side}';start=point(a,name);before=a.pose.bones[name].matrix.to_quaternion()
        set_bone(a,name,start,C(contact),ra)
        after=a.pose.bones[name].matrix.to_quaternion()
        weight=release if side=='L' else max(0,min(1,(t-14)/3))
        a.pose.bones[name].matrix=Matrix.LocRotScale(start,before.slerp(after,weight),Vector((1,1,1)))
    # Relaxed/gripping fingers are separate joints, independent of the wrist.
    for actor in [a,b]:
        for side in ['L','R']:
            for finger in range(2,6):
                for segment in range(1,4):
                    name=f'finger{finger}-{segment}.{side}'
                    if name in actor.pose.bones:actor.pose.bones[name].rotation_quaternion=Quaternion((1,0,0),math.radians([55,65,35][segment-1] if actor==a else 18))
    bpy.context.view_layer.update()

scene=bpy.context.scene;scene.render.fps=FPS;scene.frame_start=1;scene.frame_end=DURATION*FPS+1
blocking=os.environ.get('BJJ_BLOCKING')=='1'
frame_numbers=[1,8*FPS+1,22*FPS+1] if blocking else range(scene.frame_start,scene.frame_end+1,2)
animated_names={'root','head',*[f'spine{i:02}' for i in range(1,6)],*[f'neck{i:02}' for i in range(1,4)]}
animated_names.update(name for name in rig_data['bones'] if name.startswith(('upperleg','lowerleg','upperarm','lowerarm','foot.','wrist.','finger')))
for frame in frame_numbers:
    scene.frame_set(frame);pose_at((frame-1)/FPS)
    for actor,_ in actors:
        for bone in actor.pose.bones:
            if bone.name not in animated_names:continue
            bone.keyframe_insert('location',frame=frame,group=bone.name);bone.keyframe_insert('rotation_quaternion',frame=frame,group=bone.name)
    if frame%48==1:print('AUTHORED_FRAME',frame,flush=True)
for actor,_ in actors:
    actor.animation_data.action.name=actor.name+' Triangle Study'
    for curve in actor.animation_data.action.fcurves:
        for key in curve.keyframe_points:key.interpolation='LINEAR'

def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
floor_mat=mat('Mat',(.14,.20,.23),.9)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));floor=bpy.context.object;floor.name='Review floor';floor.data.materials.append(floor_mat)
for name,loc,power,size in [('Key',(-3,-4,6),650,5),('Fill',(3,1,4),450,4),('Rim',(-1,4,4),500,3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;aim(obj,(-.2,0,.5))
bpy.ops.object.camera_add(location=(-2.5,-3,2.5));camera=bpy.context.object;camera.name='Review camera';camera.data.type='ORTHO';camera.data.ortho_scale=2.5;aim(camera,(-.22,0,.48));scene.camera=camera
scene.world.color=(.3,.3,.3);scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'triangle-authoring.blend'))
# Only characters go to the website asset: lights, floor and camera belong to review.
bpy.ops.object.select_all(action='DESELECT')
for actor,mesh in actors:
    actor.select_set(True)
    for child in actor.children:child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'triangle-study.glb'),use_selection=True,export_format='GLB',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_force_sampling=True,export_frame_range=True,export_anim_slide_to_zero=True,export_optimize_animation_size=True,export_skins=True,export_all_influences=False,export_yup=True)
print('STUDY_EXPORTED',OUT,flush=True)
if os.environ.get('BJJ_RENDER','1')=='1':
    for view,location in enumerate([(-2.5,-3,2.5),(2.5,-3,1.7),(2.5,3,2.0),(-.2,0,4)]):
        camera.location=location;aim(camera,(-.22,0,.48))
        for second in ([0,8,22] if blocking else [0,4,8,12,16,22]):
            scene.frame_set(round(second*FPS)+1);scene.render.filepath=str(OUT/f'view-{view}-{second:02}.png');bpy.ops.render.render(write_still=True)
print('REVIEW_DONE',flush=True)
