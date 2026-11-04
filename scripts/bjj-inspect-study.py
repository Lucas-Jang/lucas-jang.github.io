"""Export actual deformed character landmarks, not legacy proxy geometry."""
import bpy,json,sys
from mathutils.bvhtree import BVHTree
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parent.parent
out=root/'.astro/bjj-rebuild'
bpy.ops.wm.open_mainfile(filepath=str(out/'triangle-authoring.blend'))
result={}
for second in [0,4,8,12,16,22]:
    bpy.context.scene.frame_set(second*24+1)
    result[second]={}
    for name in ['Demonstrator','Partner']:
        actor=bpy.data.objects[name]
        joints={bone:[round(x,4) for x in (actor.pose.bones[bone].head.x,actor.pose.bones[bone].head.z,-actor.pose.bones[bone].head.y)] for bone in ['root','spine01','neck01','head',*[f'{part}.{side}' for side in ['L','R'] for part in ['upperleg01','lowerleg01','foot','upperarm01','lowerarm01','wrist']]]}
        result[second][name]=joints
    surfaces=[]
    deps=bpy.context.evaluated_depsgraph_get()
    for name in ['Demonstrator training suit','Partner training suit']:
        ob=bpy.data.objects[name];ev=ob.evaluated_get(deps);mesh=ev.to_mesh()
        vertices=[ob.matrix_world@v.co for v in mesh.vertices]
        labels=[]
        for v in ob.data.vertices:
            labels.append(ob.vertex_groups[max(v.groups,key=lambda g:g.weight).group].name if v.groups else 'unweighted')
        surfaces.append((vertices,BVHTree.FromPolygons(vertices,[list(p.vertices) for p in mesh.polygons]),labels))
        result[second][name]={'minHeight':min(v.z for v in vertices),'belowMat':sum(v.z<-.008 for v in vertices)}
        ev.to_mesh_clear()
    report=[]
    for person,(vertices,_,labels) in enumerate(surfaces):
        tree=surfaces[1-person][1];depths=[];parts={}
        for vi,vertex in enumerate(vertices):
            nearest,normal,index,distance=tree.find_nearest(vertex)
            # A nearest normal alone misclassifies the concave spaces between
            # limbs. Verify odd ray parity before reporting an interior vertex.
            inside=False
            if nearest is not None and (vertex-nearest).dot(normal)<0:
                direction=Vector((.234,.567,.789)).normalized();cursor=vertex+direction*.00001;hits=0
                for _ in range(32):
                    hit,_,_,_=tree.ray_cast(cursor,direction,10)
                    if hit is None:break
                    hits+=1;cursor=hit+direction*.0001
                inside=hits%2==1
            if inside:
                depths.append(distance)
                if distance>parts.get(labels[vi],{}).get('depth',0):parts[labels[vi]]={'depth':distance,'point':[vertex.x,vertex.z,-vertex.y],'nearest':[nearest.x,nearest.z,-nearest.y]}
        report.append({'person':person,'interiorVertexCount':len(depths),'maxInteriorNearestDepth':max(depths,default=0),'worstParts':dict(sorted(parts.items(),key=lambda x:-x[1]['depth'])[:8])})
    # Diagnostic only: open surfaces and grazing rays can still misclassify.
    # These are actual skin meshes; the report is not a physical contact proof.
    result[second]['meshDiagnostics']=report
    result[second]['intersectingPolygonPairs']=len(surfaces[0][1].overlap(surfaces[1][1]))
(out/'landmarks.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result[22],indent=2))
