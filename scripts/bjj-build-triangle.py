"""Paired, editable Blender animation study. No legacy pose/bake data is imported.

Run with Blender 4.5: blender -b --factory-startup -P scripts/bjj-build-triangle.py
Outputs an authoring .blend, a skinned GLB and rendered review images under .astro.
The motion is authored, not motion capture; source provenance is kept separately.
"""
import bpy, json, math, os
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/bjj/source'
OUT = Path(os.environ.get('BJJ_AUTHORING_OUT',str(ROOT / '.astro/bjj-rebuild'))).resolve()
OUT.mkdir(parents=True, exist_ok=True)
FPS, DURATION = 24, 22
OVERHEAD_CLEARANCE=.30
EXTEND_LEG_RETRACTION=True
ENTRY_CLEARANCE={'outsideWristX':-.10,'outsideWristY':.35,'outsideWristZ':-.55,'outsideElbowY':.30,'outsideStart':2.35,'outsideEnd':2.85,'kneeOut':0.,'footOut':0.,'footBack':.50,'postureExtra':10.,'hipDrop':0.,'prePosture':0.,'preHipDrop':0.}
HIP_ROLL=None if os.environ.get('BJJ_DISABLE_HIP_ROLL')=='1' else json.loads((ROOT/'assets/bjj/triangle-hip-roll.json').read_text())
if HIP_ROLL is not None:assert HIP_ROLL['maxSupportErrorMeters']<.001
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
    # WebGL's standard skin shader uses four influences. Make the authoring
    # surface use those same normalized weights, rather than auditing a subtly
    # different deformation in Blender from the one visitors see.
    for vertex in data.vertices:
        influences=sorted([(g.group,g.weight) for g in vertex.groups],key=lambda g:-g[1])
        total=sum(w for _,w in influences[:4])
        for group_index,weight in influences:
            if (group_index,weight) in influences[:4]:mesh.vertex_groups[group_index].add([vertex.index],weight/total,'REPLACE')
            else:mesh.vertex_groups[group_index].remove([vertex.index])
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
        distal=sum(g.weight for g in vtx.groups if mesh.vertex_groups[g.group].name.startswith(('wrist','metacarpal','finger','foot','toe')))
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
active_grips=[]
palm_only_grips=set()
active_foot_posts=[]

def basis(up,forward):
    y=Vector(up).normalized();z=Vector(forward);z=(z-y*z.dot(y)).normalized();x=y.cross(z).normalized()
    canonical=Matrix((x,y,z)).transposed()
    conversion=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
    return conversion@canonical@conversion.transposed()

def root_matrix(hip,up,forward):return Matrix.LocRotScale(C(hip),basis(up,forward).to_quaternion(),Vector((1,1,1)))

def hip_post_blend(t):return smooth(1.5,2.5,t)*(1-smooth(5,6,t))

def floor_contacts(t):
    return [(0,'back',None),(1,'knee','L'),(1,'knee','R'),(1,'foot','L'),(1,'foot','R')]

def point(actor,name):
    bpy.context.view_layer.update()
    return actor.pose.bones[name].head.copy()

def set_bone(actor,name,head,tail,reference):
    b=actor.pose.bones[name];rb=actor.data.bones[name]
    original=(reference.to_3x3()@(rb.tail_local-rb.head_local)).normalized()
    direction=(tail-head).normalized()
    q=original.rotation_difference(direction)@reference.to_quaternion()@rb.matrix_local.to_quaternion()
    b.matrix=Matrix.LocRotScale(head,q,Vector((1,1,1)))

def set_leg_bone(actor,name,head,tail,bend_normal):
    """Aim a leg segment while keeping its front in the knee's bend plane.

    A shortest-arc aim alone leaves axial roll undefined. In raised legs that
    turns the kneecap sideways or backwards despite correct joint positions.
    Both twist segments must use the same anatomical flexion plane.
    """
    bone=actor.data.bones[name]
    original=(bone.tail_local-bone.head_local).normalized()
    front=Vector((0,-1,0));front-=original*front.dot(original);front.normalize()
    direction=(tail-head).normalized()
    posed_front=direction.cross(bend_normal).normalized()
    rest_frame=Matrix((original,front,original.cross(front))).transposed()
    posed_frame=Matrix((direction,posed_front,direction.cross(posed_front))).transposed()
    rotation=posed_frame@rest_frame.transposed()@bone.matrix_local.to_3x3()
    actor.pose.bones[name].matrix=Matrix.LocRotScale(head,rotation.to_quaternion(),Vector((1,1,1)))

def set_foot_bone(actor,side,head,tail,bend_normal):
    """Keep the ankle's lateral axis with the shin while aiming the toes."""
    name=f'foot.{side}';bone=actor.data.bones[name]
    # A world-space toe target becomes singular when it lines up with the
    # knee's lateral axis: projecting it into the bend plane then flips the
    # toes by 180 degrees. Use a stable local ankle frame with 20° dorsiflexion.
    shin=(head-point(actor,f'lowerleg01.{side}')).normalized()
    direction=(shin.cross(bend_normal)*math.cos(math.radians(20))-shin*math.sin(math.radians(20))).normalized()
    posed_lateral=bend_normal.normalized()
    rest_frame=foot_frame(side)[2]
    posed_frame=Matrix((posed_lateral,direction,posed_lateral.cross(direction))).transposed()
    rotation=posed_frame@rest_frame.transposed()@bone.matrix_local.to_3x3()
    actor.pose.bones[name].matrix=Matrix.LocRotScale(head,rotation.to_quaternion(),Vector((1,1,1)))

def chain(actor,side,kind,target,pole,reference):
    names=([f'upperleg01.{side}',f'upperleg02.{side}',f'lowerleg01.{side}',f'lowerleg02.{side}'] if kind=='leg' else [f'upperarm01.{side}',f'upperarm02.{side}',f'lowerarm01.{side}',f'lowerarm02.{side}'])
    start=point(actor,names[0]);end=C(target);hint=C(pole)
    lengths=[actor.data.bones[n].length for n in names];l1=sum(lengths[:2]);l2=sum(lengths[2:])
    minimum=math.sqrt(l1*l1+l2*l2+2*l1*l2*math.cos(math.radians(155 if kind=='leg' else 150)))
    maximum=math.sqrt(l1*l1+l2*l2+2*l1*l2*math.cos(math.radians(5)))
    d=(end-start).length;d=min(maximum,max(minimum,d));axis=(end-start).normalized();end=start+axis*d
    along=(l1*l1-l2*l2+d*d)/(2*d);centre=start+axis*along;perp=hint-centre;perp-=axis*perp.dot(axis)
    if perp.length<1e-5:perp=axis.cross(Vector((0,0,1)))
    knee=centre+perp.normalized()*math.sqrt(max(0,l1*l1-along*along))
    mid1=start+(knee-start)*(lengths[0]/l1);mid2=knee+(end-knee)*(lengths[2]/l2)
    points=[start,mid1,knee,mid2,end]
    bend_normal=(knee-start).cross(end-knee).normalized()
    for n,a,b in zip(names,points,points[1:]):
        if kind=='leg':set_leg_bone(actor,n,a,b,bend_normal)
        else:set_bone(actor,n,a,b,reference)
        bpy.context.view_layer.update()
    return end,knee

def body_pose(actor,desc):
    for b in actor.pose.bones:b.matrix_basis=Matrix.Identity(4)
    reference=root_matrix(desc['hip'],desc['up'],desc['forward'])
    actor.pose.bones['root'].matrix=reference@actor.data.bones['root'].matrix_local
    # Curvature is distributed through the lumbar and thoracic spine.
    for i,name in enumerate(['spine05','spine04','spine03','spine02','spine01']):
        amount=desc['spine_angles'][i] if 'spine_angles' in desc else desc.get('bend',0)/5
        b=actor.pose.bones[name];axis=actor.data.bones[name].matrix_local.to_3x3().inverted()@Vector((1,0,0));b.rotation_quaternion=Quaternion(axis,math.radians(amount))
    for name in ['neck01','neck02','neck03']:
        axis=actor.data.bones[name].matrix_local.to_3x3().inverted()@Vector((1,0,0))
        actor.pose.bones[name].rotation_quaternion=Quaternion(axis,math.radians(desc.get('neck',0))/3)
    bpy.context.view_layer.update()
    return reference

def canonical(v):return Vector((v.x,v.z,-v.y))

def smooth(a,b,t):
    v=max(0,min(1,(t-a)/(b-a)));return v*v*(3-2*v)

def pelvic_roll(t):
    if HIP_ROLL is None or not 2<t<6:return None
    keys=HIP_ROLL['keys'];i=min(len(keys)-2,max(0,int((t-2)*12)))
    a,b=keys[i:i+2];f=max(0,min(1,(t-a[0])/(b[0]-a[0])))
    return [x+(y-x)*f for x,y in zip(a[1:],b[1:])]

def palm_frame(side):
    wrist=rest_joints[f'wrist.{side}____head']
    bases=[rest_joints[f'finger{i}-1.{side}____head'] for i in range(2,6)]
    centre=(sum(bases,Vector())/4+wrist)*.5
    forward=(sum(bases,Vector())/4-wrist).normalized()
    normal=(bases[0]-bases[-1]).cross(forward).normalized()
    if normal.dot(rest_joints[f'finger1-1.{side}____head']-centre)<0:normal=-normal
    across=forward.cross(normal).normalized();normal=across.cross(forward).normalized()
    return centre,wrist,Matrix((across,forward,normal)).transposed(),normal

foot_frames={}
def foot_frame(side):
    if side not in foot_frames:
        mesh=actors[0][1];ankle=rest_joints[f'foot.{side}____head'];normal=Vector((0,0,-1))
        ids=[v.index for v in mesh.data.vertices if v.normal.z<-.35 and sum(g.weight for g in v.groups if mesh.vertex_groups[g.group].name.startswith(('foot','toe')) and mesh.vertex_groups[g.group].name.endswith('.'+side))>.6]
        assert len(ids)>6
        centre=sum((mesh.data.vertices[i].co for i in ids),Vector())/len(ids)
        forward=centre-ankle;forward-=normal*forward.dot(normal);forward.normalize()
        across=forward.cross(normal).normalized();frame=Matrix((across,forward,normal)).transposed()
        ids=sorted(ids,key=lambda i:(mesh.data.vertices[i].co-centre).length)[:6]
        foot_frames[side]=(centre,ankle,frame,normal,ids)
    return foot_frames[side]

def skin_surface(person,part,side=None):
    actor,body=actors[person];bpy.context.view_layer.update()
    evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    coordinates=[v.co.copy() for v in mesh.vertices]
    if part=='head':selected={i for i,v in enumerate(body.data.vertices) if v.co.z>rest_joints['neck03____head'].z}
    elif part=='hip':
        centre=rest_joints[f'upperleg01.{side}____head']
        selected={v.index for v in body.data.vertices if (v.co-centre).length<.25 and sum(g.weight for g in v.groups if body.vertex_groups[g.group].name.startswith(('root','pelvis','spine05',f'upperleg01.{side}',f'upperleg02.{side}')))>.45}
    elif part=='knee':
        joint_position=rest_joints[f'lowerleg01.{side}____head']
        selected={v.index for v in body.data.vertices if (v.co-joint_position).length<.18 and sum(g.weight for g in v.groups if body.vertex_groups[g.group].name in [f'upperleg02.{side}',f'lowerleg01.{side}',f'lowerleg02.{side}'])>.45}
    else:
        prefixes=[part+'01.'+side,part+'02.'+side]
        selected={v.index for v in body.data.vertices if sum(g.weight for g in v.groups if body.vertex_groups[g.group].name in prefixes)>.45}
    polygons=[list(p.vertices) for p in mesh.polygons if all(i in selected for i in p.vertices)]
    tree=BVHTree.FromPolygons(coordinates,polygons);evaluated.to_mesh_clear()
    return tree

def foot_contact(side,knee,ankle):
    a,b=[pair[0] for pair in actors]
    centre=point(b,'upperleg01.L')
    # Approach the near hip from the guard player's pelvis. Using the moving
    # knee as the ray origin can jump to the far side on the next IK pass.
    radial=point(a,'upperleg01.R')-centre
    radial+=.45*(centre-point(b,'upperleg01.R')).normalized()
    radial.normalize()
    tree=skin_surface(1,'hip','L');hit,normal,_,_=tree.ray_cast(centre+radial*.4,-radial,.8)
    if hit is None:hit,normal,_,_=tree.find_nearest(centre+radial*.15)
    if normal.dot(radial)<0:normal=-normal
    normal.normalize();inward=-normal
    forward=point(a,f'upperleg01.{side}')-ankle;forward-=normal*forward.dot(normal)
    if forward.length<1e-5:forward=Vector((0,0,1))-normal*normal.z
    forward.normalize()
    if forward.z<0:forward=-forward
    across=forward.cross(inward).normalized();forward=inward.cross(across).normalized()
    sole,rest_ankle,rest_frame,_,_=foot_frame(side)
    delta=Matrix((across,forward,inward)).transposed()@rest_frame.transposed()
    target=hit+normal*.003-delta@(sole-rest_ankle)
    q=(delta@a.data.bones[f'foot.{side}'].matrix_local.to_3x3()).to_quaternion()
    return target,q,normal

grip_frames={}
grip_calibrating=None
grip_initializing=False
grip_reference_times={('L','lowerarm','R',None):0,('L','lowerarm','L',None):6,('R','head',None,None):13,('L','knee','L',None):16}

def hand_contact(person,side,target_person,part,target_side,reference,along=.65,slot=None):
    actor=actors[person][0];target=actors[target_person][0]
    shoulder=point(actor,f'upperarm01.{side}')
    if part=='head':
        head_pose=target.pose.bones['head']
        centre=head_pose.head.lerp(head_pose.tail,.6);axis=(point(target,'neck01')-centre).normalized()
        radial=(head_pose.matrix.to_3x3()@target.data.bones['head'].matrix_local.to_3x3().inverted()@Vector((0,1,0))).normalized()
        # Contact the rear/side of the skull, not the face or the neck centre.
        lateral=shoulder-centre;lateral-=axis*lateral.dot(axis);lateral-=radial*lateral.dot(radial)
        if lateral.length>1e-5:radial=(radial*.35+lateral.normalized()*.94).normalized()
    else:
        first=point(target,f'{"lowerleg" if part=="knee" else part}01.{target_side}')
        last=point(target,f'{"foot" if part in ["lowerleg","knee"] else "wrist"}.{target_side}')
        axis=(last-first).normalized();centre=first.lerp(last,along)
        radial=shoulder-centre;radial-=axis*radial.dot(axis);radial.normalize()
        if part=='knee':
            radial=(point(target,f'upperleg01.{target_side}')-point(target,f'upperleg01.{"R" if target_side=="L" else "L"}')).normalized()
            radial-=axis*radial.dot(axis);radial.normalize()
    key=(side,part,target_side,slot)
    held_bone=target.pose.bones['head' if part=='head' else f'{"lowerleg01" if part=="knee" else part+"02"}.{target_side}']
    held_frame=held_bone.matrix.to_3x3()
    if key in grip_frames:
        radial=held_frame@grip_frames[key]
        radial-=axis*radial.dot(axis);radial.normalize()
    elif key in grip_reference_times and grip_calibrating==grip_reference_times[key]:
        grip_frames[key]=held_frame.inverted()@radial
    tree=skin_surface(target_person,part,target_side)
    hit,normal,_,_=tree.ray_cast(centre+radial*.22,-radial,.44)
    if hit is None:
        hit,normal,_,_=tree.find_nearest(centre+radial*.075)
    if normal.dot(radial)<0:normal=-normal
    normal.normalize()
    palm,wr,rest_frame,palmar_normal=palm_frame(side)
    inward=-normal;forward=axis.normalized() if part=='head' else axis.cross(normal).normalized()
    # Keep the same circumferential direction through the entire grip instead
    # of choosing a new 180-degree equivalent at each frame.
    if side=='R' and part!='head':forward=-forward
    across=forward.cross(inward).normalized();forward=inward.cross(across).normalized()
    delta=Matrix((across,forward,inward)).transposed()@rest_frame.transposed()
    # The palm's bones are inside its skin. Keep that thickness outside the
    # target surface and point the palmar face inward toward the grasp.
    centre_target=hit+normal*.013
    wrist_target=centre_target-delta@(palm-wr)
    q=(delta@actor.data.bones[f'wrist.{side}'].matrix_local.to_3x3()).to_quaternion()
    return wrist_target,q,delta,palmar_normal

def curl_hand(actor,side,delta,palmar_normal,angles):
    for finger in range(1,6):
        for segment in range(1,4):
            name=f'finger{finger}-{segment}.{side}'
            if name not in actor.pose.bones:continue
            bone=actor.data.bones[name]
            direction=(bone.tail_local-bone.head_local).normalized()
            axis=direction.cross(palmar_normal)
            if axis.length<1e-5:continue
            axis=bone.matrix_local.to_3x3().inverted()@axis.normalized()
            amount=angles[segment-1]*(.55 if finger==1 else 1)
            actor.pose.bones[name].rotation_quaternion=Quaternion(axis,math.radians(amount))

# Paired blocking poses. Actual contact targets are evaluated against the partner
# below, after both torsos have been posed, so a grip follows the moving surface.
# This file is an editable motion study, not a technique-certified final asset.
KEYS=[
 # t, hip A, turn A, hip B, lean B, left foot A, right foot A
 (0,[-.15,.15,0],0,[.32,.53,0],-35,[.35,.65,-.26],[.35,.65,.26]),
 (2,[-.16,.16,0],0,[.31,.53,0],-40,[.35,.65,-.26],[.31,.48,.22]),
 (4,[-.22,.22,0],0,[.29,.52,0],-45,[-.10,1.01,-.24],[.31,.48,.22]),
 (6,[-.28,.32,0],0,[.28,.51,0],-60,[-.20,.82,.25],[-.22,.87,-.24]),
 (8,[-.28,.31,0],0,[.28,.50,0],-65,[-.22,.80,.25],[-.24,.83,-.24]),
 (9,[-.28,.31,.02],5,[.28,.50,0],-65,[-.23,.795,.25],[-.05,1.02,.42]),
 (10,[-.28,.31,.04],10,[.28,.50,0],-65,[-.24,.79,.25],[.15,.46,.25]),
 (12,[-.26,.32,.08],24,[.26,.50,0],-68,[-.24,.77,.25],[.15,.46,.25]),
 (14,[-.25,.33,.10],42,[.25,.50,0],-70,[-.25,.75,.25],[-.25,1.02,.36]),
 (16,[-.25,.33,.10],48,[.25,.50,0],-71,[-.25,.74,.25],[-.35,.49,.01]),
 (19,[-.25,.33,.10],48,[.25,.50,0],-72,[-.25,.74,.25],[-.35,.49,.01]),
 (22,[-.25,.33,.10],48,[.25,.50,0],-72,[-.25,.74,.25],[-.35,.49,.01]),
]

def interpolate(t):
    i=next((i for i in range(len(KEYS)-1) if t<=KEYS[i+1][0]),len(KEYS)-2)
    a,b=KEYS[i:i+2];s=max(0,min(1,(t-a[0])/(b[0]-a[0])));s=s*s*(3-2*s)
    return [t]+[(Vector(x).lerp(Vector(y),s) if isinstance(x,list) else x+(y-x)*s) for x,y in zip(a[1:],b[1:])]

def pose_at(t):
    global grip_calibrating,grip_initializing
    # A sustained grip uses the same side of the held limb throughout. Choosing
    # the closest side to the shoulder anew each frame caused a half-turn flip
    # as the captured wrist crossed the abdomen.
    if len(grip_frames)<len(grip_reference_times) and not grip_initializing:
        grip_initializing=True
        for calibration_time in [0,6,13,16]:
            grip_calibrating=calibration_time;pose_at(calibration_time)
        grip_calibrating=None;grip_initializing=False
    active_grips.clear()
    palm_only_grips.clear()
    active_foot_posts.clear()
    _,hip,angle,bhip,lean,footL,footR=interpolate(t)
    posture=smooth(4,8,t)
    hip=Vector(hip);hip.y-=.13*posture
    entry=math.sin(math.pi*smooth(2,6,t)) if HIP_ROLL is not None else 0
    roll_pose=pelvic_roll(t)
    hip.z-=.15*smooth(10,16,t)
    hip.x-=.15*smooth(10,16,t)
    bhip=Vector(bhip);bhip.y-=.05+.065*posture
    bhip.y-=ENTRY_CLEARANCE['hipDrop']*entry
    pre_posture=smooth(1.5,2,t)*(1-smooth(2,4,t))
    bhip.y-=ENTRY_CLEARANCE['preHipDrop']*pre_posture
    footL=Vector(footL);footR=Vector(footR)
    shoot=math.sin(math.pi*smooth(2,4,t))
    pullback=shoot if t<=3 or not EXTEND_LEG_RETRACTION else 1-smooth(4,6,t)
    footL.x-=ENTRY_CLEARANCE['footBack']*pullback
    footL.z-=ENTRY_CLEARANCE['footOut']*math.sin(math.pi*smooth(2.5,3.5,t))
    footL.y+=.20*shoot
    footL.y-=.15*posture
    footL.y-=.05*smooth(4,6,t)
    overhead=math.sin(math.pi*smooth(3.5,6,t))
    footL.y+=OVERHEAD_CLEARANCE*overhead
    footL.z-=.03*smooth(12,16,t)
    if t>=5:footR.y-=.14*posture
    fold=smooth(14,16,t)
    footR.y-=.05*smooth(4,6,t)
    footR=footR.lerp(Vector([-.69,.25,.30]),fold)
    # Clear the upright toes of the choking leg before closing the figure-four.
    # A direct blend of ankle endpoints cuts through that foot at 14.5 seconds.
    footR.z+=.22*math.sin(math.pi*fold)
    theta=math.radians(angle);a_up=[-math.cos(theta),max(-.22,min(.03,(.17-hip.y)/.65)),-math.sin(theta)];a_fwd=[0,1,0]
    a_bend=4-8*min(1,t/6)
    if roll_pose is not None:
        pitch,a_bend,dx,*root_lift=roll_pose;pitch=math.radians(pitch)
        hip.x+=dx;hip.y+=root_lift[0] if root_lift else HIP_ROLL['hipLiftMeters']*entry+HIP_ROLL.get('overheadHipLiftMeters',0)*overhead
        a_up=[-math.cos(theta)*math.cos(pitch),-math.sin(pitch),-math.sin(theta)*math.cos(pitch)]
    lean-=(HIP_ROLL['postureBreakDegrees']*entry if HIP_ROLL is not None else 0)
    lean-=ENTRY_CLEARANCE['postureExtra']*smooth(2,4,t)*(1-smooth(4,6,t))
    lean-=ENTRY_CLEARANCE['prePosture']*pre_posture
    lean=math.radians(lean)
    a,b=[pair[0] for pair in actors]
    ra=body_pose(a,dict(hip=hip,up=a_up,forward=a_fwd,bend=a_bend,neck=-3))
    rb=body_pose(b,dict(hip=bhip,up=[math.sin(lean),math.cos(lean),0],forward=[-math.cos(lean),math.sin(lean),0],bend=8+10*posture,neck=-8))
    # Drawing the trapped arm across also protracts that shoulder. Moving only
    # its wrist leaves a wide, rigid shoulder inside an impossibly small loop.
    for name,amount in [('clavicle.L',-.55),('shoulder01.L',-.25)]:
        axis=b.data.bones[name].matrix_local.to_3x3().inverted()@Vector((0,0,1))
        b.pose.bones[name].rotation_quaternion=Quaternion(axis,amount*max(posture,.7*entry))
    bpy.context.view_layer.update()
    # Partner's knees remain planted. The ankles follow the shin and mat, rather
    # than drifting as the torso leans. Canonical +/- Z distinguish their sides.
    for side,z in [('L',.22),('R',-.22)]:
        travel=smooth(2,6,t);ankle=.78-.12*travel
        end,knee=chain(b,side,'leg',[ankle,.075+.04*math.sin(math.pi*travel),z],[.16,.04,z+math.copysign(.13*posture,z)],rb)
        pb=b.pose.bones[f'foot.{side}'];start=point(b,f'foot.{side}')
        set_bone(b,f'foot.{side}',start,start+C([.16,-.01,0]),rb)
    # The left thigh goes outside the shoulder; the second leg repositions and
    # folds over it after the hip-angle phase. Knees retain anatomical identity.
    a_knees=[[-.38,.72-.09*posture,-.18],[-.08,.77-.14*posture,.36]]
    for pole in a_knees:pole[1]-=.05*smooth(4,6,t)
    a_knees[0][1]+=.12*shoot
    a_knees[0][1]+=OVERHEAD_CLEARANCE*(.10/.18)*overhead
    a_knees[0][2]-=ENTRY_CLEARANCE['kneeOut']*shoot
    lock=max(0,min(1,(t-12)/4))
    a_knees[1]=Vector(a_knees[1]).lerp(Vector([-.33,.51-.05*smooth(4,6,t),.28]),lock)
    a_knees[1].z+=.18*math.sin(math.pi*fold)
    for side,target,pole in [('L',footL,a_knees[0]),('R',footR,a_knees[1])]:
        end,knee=chain(a,side,'leg',target,pole,ra)
        # Dorsiflexion is authored explicitly; a foot is not a symmetric oval.
        start=point(a,f'foot.{side}')
        toe=C([-.08,.10,.03 if side=='L' else -.03])
        if side=='L':toe=toe.lerp(C([.12,.02,.06]),smooth(2,2.5,t)*(1-smooth(4,5,t)))
        if side=='R':toe=toe.lerp(C([-.10,-.02,-.04]),max(0,min(1,(t-12)/4)))
        bend_normal=(knee-point(a,f'upperleg01.{side}')).cross(start-knee).normalized()
        set_foot_bone(a,side,start,start+toe,bend_normal)
        if side=='R':
            plant=hip_post_blend(t)
            bpy.context.view_layer.update()
            normal_q=a.pose.bones['foot.R'].matrix.to_quaternion()
            for _ in range(2 if plant>0 else 0):
                post=foot_contact('R',point(a,'lowerleg01.R'),point(a,'foot.R'))
                target=C(footR).lerp(post[0],plant)+post[2]*(.04*math.sin(math.pi*plant))
                hip_joint=point(a,'upperleg01.R');axis=(target-hip_joint).normalized()
                lateral=post[1].to_matrix()@a.data.bones['foot.R'].matrix_local.to_3x3().transposed()@Vector((1,0,0))
                lateral-=axis*lateral.dot(axis);lateral.normalize()
                post_pole=hip_joint+(target-hip_joint)*.5+axis.cross(lateral)*.5
                pole=C(a_knees[1]).lerp(post_pole,plant)
                chain(a,'R','leg',canonical(target),canonical(pole),ra)
                a.pose.bones['foot.R'].matrix=Matrix.LocRotScale(point(a,'foot.R'),normal_q.slerp(post[1],plant),Vector((1,1,1)))
            if plant>.999:active_foot_posts.append(('R',1,'hip','L'))
    # Anatomical sides matter: A's left hand initially pushes B's RIGHT arm
    # outside, while A's right hand draws B's LEFT arm inside the leg loop.
    trapped=smooth(4,8,t)
    transfer=smooth(10,13,t)
    # Draw the wrist toward the abdomen before taking it across. A diagonal
    # shortcut from the first grip to the opposite side crosses the choking leg.
    draw=Vector([-.60,.38,.05]).lerp(Vector([-.40,.45,.05]),smooth(8,10,t))
    b_left=Vector([-.25,.50,.23]).lerp(draw,trapped).lerp(Vector([-.53,.40,-.23]),transfer)
    b_left=b_left.lerp(Vector([-.55,.55,.05]),entry)
    b_left.y-=.08*math.sin(math.pi*transfer)
    b_left.y-=.05
    if HIP_ROLL is not None:
        carry=HIP_ROLL.get('overheadHipLiftMeters',0)*overhead
        b_left.y+=carry;b_left.x-=carry
    outside_motion=smooth(ENTRY_CLEARANCE['outsideStart'],ENTRY_CLEARANCE['outsideEnd'],t)
    outside_x=ENTRY_CLEARANCE['outsideWristX']+(-.1-ENTRY_CLEARANCE['outsideWristX'])*smooth(3.5,4,t)
    b_right=Vector([-.25,.50,-.23]).lerp(Vector([outside_x,ENTRY_CLEARANCE['outsideWristY'],ENTRY_CLEARANCE['outsideWristZ']]),outside_motion).lerp(Vector([-.20,.10,-.34]),smooth(5.5,8,t))
    b_right.z-=.16*math.sin(math.pi*smooth(5.5,8,t))
    b_right.y-=.05
    outside_elbow=Vector([.05,.38,-.45]).lerp(Vector([.10,ENTRY_CLEARANCE['outsideElbowY'],ENTRY_CLEARANCE['outsideWristZ']-.05]),outside_motion).lerp(Vector([.05,.38,-.45]),smooth(5.5,8,t))
    outside_elbow.y-=.05
    for side,target,pole in [('L',b_left,[-.45,.27,.02]),('R',b_right,outside_elbow)]:chain(b,side,'arm',target,pole,rb)
    grips={
      'L':hand_contact(0,'L',1,'lowerarm','R',ra,.82),
      'R':hand_contact(0,'R',1,'lowerarm','L',ra,.80),
      'capture':hand_contact(0,'L',1,'lowerarm','L',ra,.98),
      'head':hand_contact(0,'R',1,'head',None,ra),
      'knee':hand_contact(0,'L',0,'knee','L',ra,0),
    }
    if t<=2:active_grips.append(('L',1,'lowerarm','R',grips['L']))
    if 6<=t<=9:active_grips.append(('L',1,'lowerarm','L',grips['capture']))
    if t>=14:active_grips.append(('L',0,'knee','L',grips['knee']))
    if t<=5.5:active_grips.append(('R',1,'lowerarm','L',grips['R']))
    if 9<=t<=14 or t>=17:active_grips.append(('R',1,'head',None,grips['head']))
    # Uncurl while the palm still rests on the wrist, then withdraw the hand.
    # Translating a still closed grip drags its thumb through the held forearm.
    if 1.65<t<=2:palm_only_grips.add('L')
    if 5.1<t<=5.5:palm_only_grips.add('R')
    if 6<=t<6.35:palm_only_grips.add('L')
    if 14<=t<14.35:palm_only_grips.add('L')
    # A released hand moves through a reachable intermediate pose before taking
    # the next grip. It does not continue following the arm it has let go of.
    arm_reference=a.pose.bones['spine01'].matrix@a.data.bones['spine01'].matrix_local.inverted()
    neutral=C([-.48,.40,-.27]);neutral_q=arm_reference.to_quaternion()@a.data.bones['wrist.L'].matrix_local.to_quaternion()
    let_go=smooth(2,2.35,t);take_capture=smooth(3,6,t);take_head=smooth(5.5,9,t)
    left=grips['L'][0].lerp(neutral,let_go).lerp(grips['capture'][0],take_capture)
    left+=C([-.20,.08,.06])*math.sin(math.pi*let_go)
    left_q=grips['L'][1].slerp(neutral_q,let_go).slerp(grips['capture'][1],take_capture)
    release=smooth(9,10,t);regrip=smooth(11,14,t)
    left=left.lerp(C([-.65,.30,-.32]),release).lerp(grips['knee'][0],regrip)
    left_q=left_q.slerp(neutral_q,release).slerp(grips['knee'][1],regrip)
    right=grips['R'][0].lerp(grips['head'][0],take_head)
    right+=C([-.12,.04,-.12])*math.sin(math.pi*take_head)
    right_q=grips['R'][1].slerp(grips['head'][1],take_head)
    clear_leg=smooth(14,14.5,t);restore_head=smooth(16,17,t)
    right=right.lerp(C([-.70,.30,.05]),clear_leg).lerp(grips['head'][0],restore_head)
    right+=C([-.08,0,.08])*math.sin(math.pi*clear_leg)*(1-restore_head)+C([-.08,.03,.16])*math.sin(math.pi*restore_head)
    right_neutral_q=arm_reference.to_quaternion()@a.data.bones['wrist.R'].matrix_local.to_quaternion()
    right_q=right_q.slerp(right_neutral_q,clear_leg).slerp(grips['head'][1],restore_head)
    for side,target,q,pole in [('L',left,left_q,[-.64,.36,-.40]),('R',right,right_q,[-.68,.35,.43])]:
        chain(a,side,'arm',canonical(target),pole,arm_reference)
        start=point(a,f'wrist.{side}')
        a.pose.bones[f'wrist.{side}'].matrix=Matrix.LocRotScale(start,q,Vector((1,1,1)))
        if side=='L':
            open_wrist=smooth(1.65,2,t)
            # Prepare an open hand before arrival, then wrap only after the
            # palm has reached the wrist. A closing fist must not fly into it.
            capture_fingers=take_capture*(1-smooth(4.75,5.4,t))+smooth(6,6.35,t)
            knee_fingers=smooth(14,14.35,t)
            angles=[(((v*(1-open_wrist)+n*open_wrist)*(1-capture_fingers)+s*capture_fingers)*(1-release)+n*release)*(1-knee_fingers)+k*knee_fingers for v,n,s,k in zip([50,70,40],[10,20,10],[45,65,40],[40,40,25])]
        else:
            open_wrist=smooth(5.1,5.5,t)
            angles=[((v*(1-open_wrist)+h*open_wrist)*(1-clear_leg)+n*clear_leg)*(1-restore_head)+h*restore_head for v,h,n in zip([50,70,40],[12,18,12],[10,20,10])]
        curl_hand(a,side,None,palm_frame(side)[3],angles)
    for side in ['L','R']:curl_hand(b,side,None,palm_frame(side)[3],[8,15,8])
    bpy.context.view_layer.update()

def build_clip():
    scene=bpy.context.scene;scene.render.fps=FPS;scene.frame_start=1;scene.frame_end=DURATION*FPS+1
    blocking=os.environ.get('BJJ_BLOCKING')=='1'
    frame_numbers=[1,8*FPS+1,22*FPS+1] if blocking else range(scene.frame_start,scene.frame_end+1)
    animated_names={'root','head',*[f'spine{i:02}' for i in range(1,6)],*[f'neck{i:02}' for i in range(1,4)]}
    animated_names.update(name for name in rig_data['bones'] if name.startswith(('clavicle','shoulder','upperleg','lowerleg','upperarm','lowerarm','foot.','toe','wrist.','metacarpal','finger')))
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

if __name__=='__main__':build_clip()
