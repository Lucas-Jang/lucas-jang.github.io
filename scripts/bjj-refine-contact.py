"""Bounded articulated contact correction on the actual four-weight skin mesh.

Uses paired, surface-anchored palms and anatomical hinge axes. The linearized
contact solve cannot change bone lengths or deform mesh vertices independently.
Run in Blender's Python (SciPy is an offline authoring dependency).
"""
import os,runpy,json,math,time,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from scipy.optimize import lsq_linear
from scipy.spatial.transform import Rotation
from scipy.spatial import cKDTree,ConvexHull

ROOT=Path(__file__).resolve().parent.parent
env=runpy.run_path(str(ROOT/'scripts/bjj-build-triangle.py'),run_name='bjj_definitions')
actors=env['actors'];out=env['OUT'];C=env['C']
version={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['scripts/bjj-build-triangle.py','scripts/bjj-refine-contact.py','scripts/bjj-contact-path.py','scripts/bjj-contact-sample.py','scripts/bjj-fast-author.py','assets/bjj/triangle-hip-roll.json']}
(out/('audit-source-version.json' if os.environ.get('BJJ_CONTACT_LIBRARY')=='1' else 'authoring-version.json')).write_text(json.dumps(version,indent=2))
print('AUTHORING_VERSION',json.dumps(version),flush=True)
def arr(m):return np.array(m,dtype=float)
def unit(v):return v/max(np.linalg.norm(v),1e-12)

class Skin:
    def __init__(self,actor,mesh):
        self.actor,self.mesh=actor,mesh
        ordered=[];pending=list(actor.data.bones)
        while pending:
            for bone in pending[:]:
                if bone.parent is None or bone.parent.name in ordered:ordered.append(bone.name);pending.remove(bone)
        self.names=ordered;self.lookup={n:i for i,n in enumerate(ordered)}
        self.parents=np.array([self.lookup[actor.data.bones[n].parent.name] if actor.data.bones[n].parent else -1 for n in ordered])
        self.rest=np.array([arr(actor.data.bones[n].matrix_local) for n in ordered]);self.inverse=np.linalg.inv(self.rest)
        self.relative=np.array([self.inverse[p]@r if p>=0 else r for p,r in zip(self.parents,self.rest)])
        self.ancestors=np.eye(len(ordered),dtype=bool)
        for i,p in enumerate(self.parents):
            if p>=0:self.ancestors[i]|=self.ancestors[p]
        self.v=np.array([list(v.co)+[1] for v in mesh.data.vertices])
        self.normals=np.array([list(v.normal) for v in mesh.data.vertices])
        self.ids=np.zeros((len(self.v),4),int);self.weights=np.zeros((len(self.v),4))
        for v in mesh.data.vertices:
            for j,g in enumerate(v.groups):self.ids[v.index,j]=self.lookup[mesh.vertex_groups[g.group].name];self.weights[v.index,j]=g.weight
        mesh.data.calc_loop_triangles();self.faces=np.array([list(t.vertices) for t in mesh.data.loop_triangles],int)
        self.dominant=np.array([self.names[i] for i in self.ids[np.arange(len(self.ids)),self.weights.argmax(1)]])
        self.parts={}
        self.parts['body']=np.flatnonzero(np.array([n.startswith(('root','spine','pelvis','breast','clavicle','shoulder')) for n in self.dominant]))
        for side in ['L','R']:
            for part,prefixes in [('thigh',('upperleg',)),('calf',('lowerleg',)),('foot',('foot','toe')),('hand',('wrist','metacarpal','finger')),('forearm',('lowerarm',))]:
                self.parts[part+'.'+side]=np.flatnonzero(np.array([n.endswith('.'+side) and n.startswith(prefixes) for n in self.dominant]))
            self.parts['leg.'+side]=np.flatnonzero(np.array([n.endswith('.'+side) and n.startswith(('upperleg','lowerleg','foot','toe')) for n in self.dominant]))
            self.parts['thumb.'+side]=np.flatnonzero(np.isin(self.dominant,[f'finger1-2.{side}',f'finger1-3.{side}']))
            self.parts['index.'+side]=np.flatnonzero(np.array([n.startswith('finger2-') and n.endswith('.'+side) for n in self.dominant]))
        self.closed_regions={}
        for part in ['body','leg.L','leg.R','index.L','index.R']:
            mask=np.zeros(len(self.v),bool);mask[self.parts[part]]=True
            region_faces=self.faces[mask[self.faces].all(1)]
            edges=np.sort(np.vstack([region_faces[:,[0,1]],region_faces[:,[1,2]],region_faces[:,[2,0]]]),axis=1)
            unique,counts=np.unique(edges,axis=0,return_counts=True);remaining={tuple(e) for e in unique[counts==1]};loops=[]
            while remaining:
                a,b=remaining.pop();chain=[a,b]
                while chain[-1]!=chain[0]:
                    candidates=[e for e in remaining if chain[-1] in e]
                    if not candidates:break
                    edge=candidates[0];remaining.remove(edge);chain.append(edge[1] if edge[0]==chain[-1] else edge[0])
                if len(chain)>3 and chain[-1]==chain[0]:loops.append(chain[:-1])
            self.closed_regions[part]=(region_faces,loops)
        self.allowed={}
        self.spec=[]
        for name,bound in [('root',.18),('spine05',.18),('spine03',.18),('spine01',.18),('neck01',.25),('head',.25)]:
            for axis in np.eye(3):self.spec.append((self.lookup[name],axis,bound))
        for side in ['L','R']:
            for name,bound in [(f'upperleg01.{side}',.50),(f'foot.{side}',.75),(f'clavicle.{side}',.25),(f'shoulder01.{side}',.20),(f'upperarm01.{side}',.65),(f'wrist.{side}',.60)]:
                for axis in np.eye(3):self.spec.append((self.lookup[name],axis,bound))
            for kind in ['lowerleg01','lowerarm01']:
                self.spec.append((self.lookup[f'{kind}.{side}'],None,.50))
            for finger in range(1,6):
                for segment in range(1,4):
                    name=f'finger{finger}-{segment}.{side}'
                    if name not in self.lookup:continue
                    bone=actor.data.bones[name];direction=arr((bone.tail_local-bone.head_local).normalized());normal=arr(env['palm_frame'](side)[3]);axis=unit(np.cross(direction,normal))
                    axis=self.rest[self.lookup[name],:3,:3].T@axis
                    if finger==1 and segment==1:
                        for thumb_axis in np.eye(3):self.spec.append((self.lookup[name],thumb_axis,.8))
                    else:self.spec.append((self.lookup[name],axis,.45))
            for metacarpal in range(1,5):
                name=f'metacarpal{metacarpal}.{side}'
                if name not in self.lookup:continue
                bone=actor.data.bones[name];axis=unit(np.cross(arr((bone.tail_local-bone.head_local).normalized()),arr(env['palm_frame'](side)[3])))
                self.spec.append((self.lookup[name],self.rest[self.lookup[name],:3,:3].T@axis,.2))
        self.count=3+len(self.spec)
        self.hinges=[i for i,(_,axis,_) in enumerate(self.spec) if axis is None]

    def capture(self,basis=None):
        self.basis=np.array([arr(self.actor.pose.bones[n].matrix_basis) for n in self.names]) if basis is None else np.array(basis,copy=True);self.base_basis=self.basis.copy()
        self.forward()
        for k,(bone,axis,bound) in enumerate(self.spec):
            if k in self.hinges:
                name=self.names[bone];side=name[-1];leg=name.startswith('lowerleg')
                start=self.world[self.lookup[f'{"upperleg01" if leg else "upperarm01"}.{side}'],:3,3]
                knee=self.world[bone,:3,3];end=self.world[self.lookup[f'{"foot" if leg else "wrist"}.{side}'],:3,3]
                local=self.world[bone,:3,:3].T@unit(np.cross(start-knee,end-knee))
                self.spec[k]=(bone,unit(local),bound)
        self.forward()
        self.base_world=self.world.copy();self.total=np.zeros(self.count)
        self.minimum=np.r_[np.full(3,-.05),[-bound for _,_,bound in self.spec]]
        self.maximum=-self.minimum
        for k in self.hinges:
            bone,axis,bound=self.spec[k];side=self.names[bone][-1];leg=self.names[bone].startswith('lowerleg')
            start=self.world[self.lookup[f'{"upperleg01" if leg else "upperarm01"}.{side}'],:3,3]
            knee=self.world[bone,:3,3];end=self.world[self.lookup[f'{"foot" if leg else "wrist"}.{side}'],:3,3]
            bend=math.acos(np.clip(unit(knee-start)@unit(end-knee),-1,1))
            self.minimum[k+3]=-min(bound,max(0,math.radians(155 if leg else 150)-bend))
            self.maximum[k+3]=min(bound,max(0,bend-math.radians(5)))

    def forward(self):
        self.world=np.empty_like(self.rest)
        for i,p in enumerate(self.parents):self.world[i]=(self.world[p]@self.relative[i] if p>=0 else self.relative[i])@self.basis[i]
        skin=self.world@self.inverse
        self.components=np.einsum('nvij,nj->nvi',skin[self.ids,:3,:],self.v)
        self.points=(self.components*self.weights[:,:,None]).sum(1)
        self.axes=np.array([self.world[b,:3,:3]@(axis if axis is not None else np.array([1,0,0])) for b,axis,_ in self.spec])
        self.origins=np.array([self.world[b,:3,3] for b,_,_ in self.spec])

    def point_jacobian(self,indices):
        ids=self.ids[indices];weights=self.weights[indices];component=self.components[indices]
        result=np.zeros((len(indices),3,self.count));result[:,:,:3]=np.eye(3)
        for j,(bone,_,_) in enumerate(self.spec):
            w=weights*self.ancestors[ids,bone]
            offset=(component*w[:,:,None]).sum(1)-w.sum(1)[:,None]*self.origins[j]
            result[:,:,j+3]=np.cross(self.axes[j],offset)
        return result

    def joint_jacobian(self,indices):
        result=np.zeros((len(indices),3,self.count));result[:,:,:3]=np.eye(3)
        for j,(bone,_,_) in enumerate(self.spec):
            mask=self.ancestors[indices,bone]&(indices!=bone)
            result[:,:,j+3]=np.cross(self.axes[j],self.world[indices,:3,3]-self.origins[j])*mask[:,None]
        return result

    def apply(self,delta):
        root=self.lookup['root'];self.basis[root,:3,3]+=self.rest[root,:3,:3].T@delta[:3]
        rotations=np.zeros((len(self.names),3))
        for value,(bone,axis,_) in zip(delta[3:],self.spec):rotations[bone]+=axis*value
        self.basis[:,:3,:3]=self.basis[:,:3,:3]@Rotation.from_rotvec(rotations).as_matrix()
        self.total+=delta;self.forward()

    def tree(self,part=None,side=None):
        if part:
            key=(part,side)
            if key not in self.allowed:
                if part=='head':mask=self.v[:,2]>env['rest_joints']['neck01____head'].z
                elif part=='hip':mask=(np.linalg.norm(self.v[:,:3]-arr(env['rest_joints'][f'upperleg01.{side}____head']),axis=1)<.25)&np.array([n.startswith(('root','pelvis','spine05',f'upperleg01.{side}',f'upperleg02.{side}')) for n in self.dominant])
                elif part=='index_dorsal':mask=np.array([n.startswith('finger2-') and n.endswith('.'+side) for n in self.dominant])&((self.normals@arr(env['palm_frame'](side)[3]))<-.15)
                elif part=='knee':mask=(np.linalg.norm(self.v[:,:3]-arr(env['rest_joints'][f'lowerleg01.{side}____head']),axis=1)<.18)&np.array([n in [f'upperleg02.{side}',f'lowerleg01.{side}',f'lowerleg02.{side}'] for n in self.dominant])
                elif part=='kneepit':
                    centre=arr(env['rest_joints'][f'lowerleg01.{side}____head'])
                    # Include the accessible posterolateral knee skin. The
                    # narrow centre of the folded crease can lie inside the
                    # other half of an LBS-bent leg and is not a reachable
                    # contact target for an undeformed opposing ankle.
                    mask=(np.linalg.norm(self.v[:,:3]-centre,axis=1)<.12)&(self.v[:,1]>centre[1]-.005)&(self.normals[:,1]>-.2)&np.array([n in [f'upperleg02.{side}',f'lowerleg01.{side}'] for n in self.dominant])
                else:
                    mask=np.array([n in [part+'01.'+side,part+'02.'+side] or (part=='lowerarm' and n.endswith('.'+side) and n.startswith(('wrist','metacarpal'))) for n in self.dominant])
                self.allowed[key]=np.flatnonzero(mask[self.faces].all(1))
            subset=self.allowed[key]
        else:subset=np.arange(len(self.faces))
        return BVHTree.FromPolygons(self.points.tolist(),self.faces[subset].tolist(),all_triangles=True),subset

skins=[Skin(*pair) for pair in actors]
N=sum(s.count for s in skins);offsets=[0,skins[0].count]
vertex_jacobian_cache=None
def full_jac(person,indices):
    if vertex_jacobian_cache is not None:
        lookup,values=vertex_jacobian_cache[person]
        return values[lookup[np.asarray(indices,int)]]
    output=np.zeros((len(indices),3,N));output[:,:,offsets[person]:offsets[person]+skins[person].count]=skins[person].point_jacobian(np.asarray(indices,int));return output

def cache_jacobians(collision,anchors,semantic,supports):
    global vertex_jacobian_cache
    needed=[set(),set()]
    for _,p,v,o,face,_,_ in collision:needed[p].add(v);needed[o].update(face.tolist())
    for v,o,face,_,_,_,_ in anchors:needed[0].add(v);needed[o].update(face.tolist())
    for p,source,_,o,target,_,_,_ in semantic:needed[p].update(source.tolist());needed[o].update(target.tolist())
    floors=[]
    for p,s in enumerate(skins):
        floor=np.flatnonzero(s.points[:,2]<-.006)
        if globals().get('floor_vertex_filter'):floor=floor_vertex_filter(p,floor)
        floor=floor[np.argsort(s.points[floor,2])[:20]]
        floors.append(floor);needed[p].update(floor.tolist());needed[p].update(supports[p].tolist())
    vertex_jacobian_cache=[]
    for p,s in enumerate(skins):
        ids=np.array(sorted(needed[p]),int);lookup=np.full(len(s.v),-1,int);lookup[ids]=np.arange(len(ids))
        values=np.zeros((len(ids),3,N));values[:,:,offsets[p]:offsets[p]+s.count]=s.point_jacobian(ids)
        vertex_jacobian_cache.append((lookup,values))
    return floors

def barycentric(p,tri):
    a,b,c=tri;v0=b-a;v1=c-a;v2=p-a
    d00=v0@v0;d01=v0@v1;d11=v1@v1;d20=v2@v0;d21=v2@v1;den=d00*d11-d01*d01
    if abs(den)<1e-15:return np.ones(3)/3
    v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den;return np.array([1-v-w,v,w])

def inside(tree,p):
    # Two directions must agree; if they disagree, a third breaks the tie.
    answers=[]
    for d in [(0.234,.567,.789),(-.419,.313,.852),(.713,-.581,.392)]:
        direction=Vector(d).normalized();cursor=Vector(p)+direction*.00001;count=0
        for _ in range(40):
            hit,_,_,_=tree.ray_cast(cursor,direction,10)
            if hit is None:break
            count+=1;cursor=hit+direction*.0001
        answers.append(count%2)
        if len(answers)==2 and answers[0]==answers[1]:return bool(answers[0])
    return sum(answers)>=2

def contacts(include_self=True):
    trees=[None,None];records=[];maximum=0
    for person,s in enumerate(skins):
        other=1-person;target=skins[other]
        lo=target.points.min(0)-.004;hi=target.points.max(0)+.004
        candidates=np.flatnonzero(((s.points>=lo)&(s.points<=hi)).all(1))
        if globals().get('contact_vertex_filter'):candidates=contact_vertex_filter(person,candidates)
        if not len(candidates):continue
        if trees[other] is None:trees[other]=target.tree()[0]
        tree=trees[other]
        grouped={}
        for vertex in candidates:
            p=s.points[vertex];q,normal,face,distance=tree.find_nearest(Vector(p))
            if globals().get('contact_record_filter') and not contact_record_filter(person,int(vertex),other,target.faces[face]):continue
            q=arr(q);normal=arr(normal);depth=-distance
            if (p-q)@normal<0 and inside(tree,p):depth=distance
            if depth<=-.003:continue
            direction=unit(q-p) if depth>1e-7 else unit(p-q)
            if abs(depth)<1e-7:direction=normal
            # The nearest escape direction, rather than an arbitrary normal at
            # a concave edge, is the linear separation constraint.
            group=s.dominant[vertex]
            if not any(k in group for k in ['leg','arm','finger','wrist','foot','toe']):group='body'
            grouped.setdefault(group,[]).append((depth,person,int(vertex),other,target.faces[face],q,direction))
            maximum=max(maximum,depth)
        for values in grouped.values():
            chosen=[]
            for record in sorted(values,key=lambda r:-r[0]):
                if len(chosen)>=7:break
                if any(np.linalg.norm(s.points[record[2]]-s.points[r[2]])<.014 for r in chosen):continue
                chosen.append(record)
            records.extend(chosen)
    if include_self:
        for person,s in enumerate(skins):
            hulls={}
            def hull(part):
                if part not in hulls:
                    if part=='body' or part.startswith(('leg.','index.')):
                        faces,loops=s.closed_regions[part];coordinates=s.points.tolist();cap_faces=[]
                        for loop in loops:
                            centre=len(coordinates);coordinates.append(s.points[loop].mean(0).tolist())
                            cap_faces.extend([[a,b,centre] for a,b in zip(loop,loop[1:]+loop[:1])])
                        closed=BVHTree.FromPolygons(coordinates,faces.tolist()+cap_faces,all_triangles=True)
                        skin=BVHTree.FromPolygons(s.points.tolist(),faces.tolist(),all_triangles=True)
                        points=s.points[s.parts[part]]
                        hulls[part]=(closed,skin,faces,points.min(0)-.003,points.max(0)+.003,False)
                        return hulls[part]
                    ids=s.parts[part];points=s.points[ids];convex=ConvexHull(points)
                    triangles=ids[convex.simplices].copy()
                    coordinates=s.points[triangles]
                    normals=np.cross(coordinates[:,1]-coordinates[:,0],coordinates[:,2]-coordinates[:,0])
                    reverse=(normals*convex.equations[:,:3]).sum(1)<0
                    triangles[reverse]=triangles[reverse][:,[0,2,1]]
                    tree=BVHTree.FromPolygons(s.points.tolist(),triangles.tolist(),all_triangles=True)
                    hulls[part]=(tree,tree,triangles,points.min(0)-.003,points.max(0)+.003,True)
                return hulls[part]
            pairs=[]
            pairs.extend([('hand.L','hand.R'),('hand.R','hand.L')])
            for side in ['L','R']:
                pairs.append((f'thumb.{side}',f'index.{side}'))
                pairs.extend((f'hand.{side}',target) for target in ['body','leg.L','leg.R'])
                pairs.extend((f'forearm.{side}',target) for target in ['body','leg.L','leg.R'])
                pairs.append((f'calf.{side}',f'leg.{"R" if side=="L" else "L"}'))
                pairs.extend((f'foot.{side}',target) for target in [f'thigh.{side}',f'leg.{"R" if side=="L" else "L"}'])
            if globals().get('extra_self_pairs'):pairs.extend(extra_self_pairs(person))
            for source,target in pairs:
                if globals().get('contact_pair_filter') and not contact_pair_filter(person,source,target):continue
                ids=s.parts[source];target_points=s.points[s.parts[target]]
                lo=target_points.min(0)-.003;hi=target_points.max(0)+.003
                ids=ids[((s.points[ids]>=lo)&(s.points[ids]<=hi)).all(1)]
                if not len(ids):continue
                volume,tree,faces,lo,hi,convex=hull(target)
                grouped={}
                for vertex in ids:
                    point=s.points[vertex];q,n,f,distance=tree.find_nearest(Vector(point));q=arr(q);normal=arr(n)
                    if globals().get('contact_record_filter') and not contact_record_filter(person,int(vertex),person,faces[f]):continue
                    # Anatomical part hulls are closed and convex, so their
                    # nearest surface normal gives an unambiguous inside sign.
                    depth=distance if (point-q)@normal<0 and (convex or inside(volume,point)) else -distance
                    if depth<=-.0015:continue
                    direction=unit(q-point) if depth>1e-7 else unit(point-q)
                    if abs(depth)<1e-7:direction=normal
                    grouped.setdefault(s.dominant[vertex],[]).append((depth,person,int(vertex),person,faces[f],q,direction))
                    maximum=max(maximum,depth)
                for values in grouped.values():
                    chosen=[]
                    for record in sorted(values,key=lambda r:-r[0]):
                        if len(chosen)>=5:break
                        if any(np.linalg.norm(s.points[record[2]]-s.points[r[2]])<.012 for r in chosen):continue
                        chosen.append(record)
                    records.extend(chosen)
    return records,maximum

finger_regions={}
def grip_anchors():
    finger_regions.clear()
    result=[];s=skins[0]
    for side,person,part,target_side,grip in env['active_grips']:
        palm,wr,_,normal=env['palm_frame'](side)
        eligible=np.flatnonzero(np.array([n.startswith(('wrist.','metacarpal')) and n.endswith('.'+side) for n in s.dominant]))
        distances=np.linalg.norm(s.v[eligible,:3]-arr(palm+normal*.013),axis=1)
        chosen=eligible[np.argsort(distances)[:4]]
        target=skins[person];tree,subset=target.tree(part,target_side)
        delta=arr(grip[2]);wrist=arr(grip[0])
        for vertex in chosen:
            expected=wrist+delta@(s.v[vertex,:3]-arr(wr))
            q,n,f,d=tree.find_nearest(Vector(expected));q=arr(q);n=arr(n)
            face=target.faces[subset[f]];weights=barycentric(q,target.points[face])
            result.append((int(vertex),person,face,weights,n*.002,40,'palm'))
        # The thumb stays alongside the held forearm in this open-thumb grip.
        # Forcing its tip onto the index knuckle twists the CMC joint and pulls
        # the thumb away from the forearm. The palm and four finger pads carry
        # the grip; the thumb still participates in skin collision constraints.
        if side in env.get('palm_only_grips',set()):continue
        for finger in ([2,3,4] if part=='head' else [2,3,4,5]):
            name=f'finger{finger}-3.{side}';bone=s.actor.data.bones[name]
            candidates=np.flatnonzero(s.dominant==name)
            if not len(candidates):continue
            pad=arr(bone.tail_local)+arr(normal)*.003
            vertex=int(candidates[np.argmin(np.linalg.norm(s.v[candidates,:3]-pad,axis=1))])
            pad_person=person
            pad_part=part;pad_side=target_side
            pad_target=skins[pad_person];pad_tree,pad_subset=pad_target.tree(pad_part,pad_side)
            q,n,f,d=pad_tree.find_nearest(Vector(s.points[vertex]));q=arr(q);n=arr(n)
            face=pad_target.faces[pad_subset[f]];weights=barycentric(q,pad_target.points[face])
            result.append((vertex,pad_person,face,weights,n*(.003 if finger==1 else .0015),8 if finger==1 else 6,'finger'))
            finger_regions[vertex]=(pad_person,pad_part,pad_side)
    return result

def refresh_finger_contacts(anchors):
    trees={};result=[]
    for item in anchors:
        v,p,face,w,separation,weight,kind=item
        if kind=='finger':
            p,part,side=finger_regions[v];key=(p,part,side)
            if key not in trees:trees[key]=skins[p].tree(part,side)
            tree,subset=trees[key];q,n,f,d=tree.find_nearest(Vector(skins[0].points[v]));q=arr(q);n=arr(n)
            face=skins[p].faces[subset[f]];w=barycentric(q,skins[p].points[face]);separation=n*.0015
            item=(v,p,face,w,separation,weight,kind)
        result.append(item)
    return result

def patch(person,centre,prefixes,count=3):
    s=skins[person];candidates=np.flatnonzero(np.array([n.startswith(prefixes) for n in s.dominant]))
    return candidates[np.argsort(np.linalg.norm(s.v[candidates,:3]-arr(centre),axis=1))[:count]]

def technique_contacts(t):
    result=[]
    for side,person,part,target_side in env.get('active_foot_posts',[]):
        if env['hip_post_blend'](t)<=.999:continue
        sole=np.array(env['foot_frame'](side)[4],int);centre=skins[0].points[sole].mean(0)
        tree,subset=skins[person].tree(part,target_side);q,n,f,d=tree.find_nearest(Vector(centre));face=skins[person].faces[subset[f]];q=arr(q)
        result.append((0,sole,np.ones(len(sole))/len(sole),person,face,barycentric(q,skins[person].points[face]),arr(n)*.003,18))
    if t>=6:
        # The choking shin contacts the BACK of the neck, rather than being
        # permitted to escape toward the front when a collision is corrected.
        neck=patch(1,env['rest_joints']['neck03____head']+Vector((0,.04,0)),('neck','head'))
        centre=skins[1].points[neck].mean(0);tree,subset=skins[0].tree('lowerleg','L')
        q,n,f,d=tree.find_nearest(Vector(centre));face=skins[0].faces[subset[f]];q=arr(q)
        result.append((1,neck,np.ones(len(neck))/len(neck),0,face,barycentric(q,skins[0].points[face]),arr(n)*.002,18))
    if t>=16:
        ankle=patch(0,env['rest_joints']['foot.L____head']+Vector((0,.024,.025)),('lowerleg02.L','foot.L'))
        tree,subset=skins[0].tree('kneepit','R');q,n,f,d=tree.find_nearest(Vector(skins[0].points[ankle].mean(0)))
        face=skins[0].faces[subset[f]];q=arr(q)
        closing=env['smooth'](15,16,t)
        result.append((0,ankle,np.ones(len(ankle))/len(ankle),0,face,barycentric(q,skins[0].points[face]),arr(n)*.002,6+24*closing))
    return result

LIMITS=np.array([.0025,.008,.012,.008,.002,.008])
STRICT=np.array([.002,.0075,.0115,.0075,.0015,.006])
TARGET=STRICT if os.environ.get('BJJ_STRICT_CONTACT')=='1' else LIMITS
ground_region_cache={}

def ground_support_regions(t):
    result=[]
    for person,part,side in env.get('floor_contacts',lambda t:[])(t):
        key=(person,part,side);s=skins[person]
        if key not in ground_region_cache:
            if part=='back':mask=np.array([n.startswith('spine') for n in s.dominant])&(s.normals[:,1]>.2)
            elif part=='knee':
                centre=arr(env['rest_joints'][f'lowerleg01.{side}____head'])
                mask=(np.linalg.norm(s.v[:,:3]-centre,axis=1)<.10)&np.array([n in [f'upperleg02.{side}',f'lowerleg01.{side}'] for n in s.dominant])
            else:
                mask=np.zeros(len(s.v),bool);mask[s.parts['foot.'+side]]=True
            ground_region_cache[key]=np.flatnonzero(mask)
        result.append((person,ground_region_cache[key]))
    return result

def ground_support_patches(t):
    return [(p,ids[np.argsort(skins[p].points[ids,2])[:3]]) for p,ids in ground_support_regions(t)]

def ground_support_error(t):
    return max([max(0,float(skins[p].points[ids,2].min()+.008)) for p,ids in ground_support_regions(t)],default=0.)

path_constraints=runpy.run_path(str(ROOT/'scripts/bjj-contact-path.py'))['PathConstraints'](globals())

def grip_roles():
    return {side:(person,part,target_side,side not in env.get('palm_only_grips',set())) for side,person,part,target_side,_ in env['active_grips']}

def refine_frame(t,previous=None,iterations=24,incoming=None):
    global vertex_jacobian_cache
    vertex_jacobian_cache=None
    # Carry the fitted residual along the *reviewed seed trajectory*. Carrying
    # controls relative to a different authoring IK solution can drift away
    # from the seed's leg-over-neck path before that contact becomes active.
    transported=None
    if os.environ.get('BJJ_SEED_TRANSPORT')=='1' and incoming and hasattr(refine_frame,'seed_basis'):
        transported=[]
        for fitted,old_seed in zip(incoming[0],refine_frame.seed_basis):
            residual=fitted[:,:3,:3]@np.swapaxes(old_seed[:,:3,:3],1,2)
            decay=float(os.environ.get('BJJ_SEED_TRANSPORT_DECAY','1'))
            assert 0<=decay<=1
            if decay!=1:residual=Rotation.from_rotvec(decay*Rotation.from_matrix(residual).as_rotvec()).as_matrix()
            transported.append((residual,decay*(fitted[:,:3,3]-old_seed[:,:3,3])))
    env['pose_at'](t)
    for s in skins:s.capture()
    if not hasattr(refine_frame,'checked'):
        for s in skins:
            evaluated=s.mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
            actual=np.array([list(v.co) for v in mesh.vertices]);error=np.linalg.norm(actual-s.points,axis=1).max();evaluated.to_mesh_clear()
            print('SKIN_FK_ERROR',float(error),flush=True);assert error<.00003
            test_ids=np.arange(0,len(s.v),max(1,len(s.v)//8));jac=s.point_jacobian(test_ids);original=s.points[test_ids].copy();before=s.basis.copy()
            for variable in [0,3,min(29,s.count-1),s.count-1]:
                delta=np.zeros(s.count);delta[variable]=1e-6;s.apply(delta)
                derivative=(s.points[test_ids]-original)/1e-6
                assert np.max(np.abs(derivative-jac[:,:,variable]))<.0002,(variable,np.max(np.abs(derivative-jac[:,:,variable])))
                s.basis=before.copy();s.total[:]=0;s.forward()
        refine_frame.checked=True
    anchors=grip_anchors();semantic=technique_contacts(t);pins=[];supports=[]
    print('INITIAL_PALM_ERRORS',t,[round(float(np.linalg.norm(skins[0].points[v]-(w@skins[p].points[f]+sep)))*1000,1) for v,p,f,w,sep,_,kind in anchors if kind=='palm'],flush=True)
    for p,s in enumerate(skins):
        names=['root','head','spine01',*[f'{part}.{side}' for part in ['upperleg01','lowerleg01','foot','upperarm01','lowerarm01','wrist'] for side in ['L','R']]]
        ids=np.array([s.lookup[n] for n in names]);pins.append((ids,s.world[ids,:3,3].copy()))
        back=('spine01','spine02') if 2<t<6 and env.get('HIP_ROLL') is not None else ('spine03','spine04')
        mask=np.array([n.startswith(('foot','toe')) if p==1 else n.startswith(back) for n in s.dominant])
        support=np.flatnonzero(mask);support=support[np.argsort(s.points[support,2])[:6]];supports.append(support)
    seed_path=os.environ.get('BJJ_CONTACT_SEED')
    if seed_path and (previous is None or os.environ.get('BJJ_SEED_EACH_FRAME')=='1'):
        previous=None
        Clip=runpy.run_path(str(ROOT/'scripts/bjj-contact-sample.py'))['ContactClip']
        seed_bases=Clip(seed_path).sample(t)
        refine_frame.seed_basis=seed_bases.copy()
        for p,s in enumerate(skins):
            seed=seed_bases[p].copy()
            if transported is not None:
                rotation_delta,translation_delta=transported[p]
                seed[:,:3,:3]=rotation_delta@seed[:,:3,:3]
                seed[:,:3,3]+=translation_delta
            author_hand=os.environ.get('BJJ_SEED_AUTHOR_HAND') if p==0 else None
            if author_hand:
                for bone,name in enumerate(s.names):
                    # Keep the fitted thumb CMC abduction while extending its
                    # distal joints; resetting opposition sweeps it through the
                    # forearm the hand is in the process of releasing.
                    if name.startswith('finger') and name[-1] in author_hand and name!=f'finger1-1.{name[-1]}':seed[bone]=s.base_basis[bone]
            rotation=Rotation.from_matrix(np.swapaxes(s.base_basis[:,:3,:3],1,2)@seed[:,:3,:3]).as_rotvec()
            delta=np.zeros(s.count);root=s.lookup['root'];delta[:3]=s.rest[root,:3,:3]@(seed[root,:3,3]-s.base_basis[root,:3,3])
            for bone in set(b for b,_,_ in s.spec):
                cols=[k for k,(b,_,_) in enumerate(s.spec) if b==bone]
                axes=np.array([s.spec[k][1] for k in cols]).T
                delta[np.array(cols)+3]=np.linalg.lstsq(axes,rotation[bone],rcond=None)[0]
            if os.environ.get('BJJ_SEED_EXACT')=='1':
                s.basis=seed.copy();s.total=np.clip(delta,s.minimum+1e-8,s.maximum-1e-8);s.forward()
                # The root's actual translation must match its bounded control
                # value before warm-starting the next frame.
                s.basis[root,:3,3]=s.base_basis[root,:3,3]+s.rest[root,:3,:3].T@s.total[:3];s.forward()
            else:s.apply(np.clip(delta,s.minimum+1e-8,s.maximum-1e-8))
    if previous is not None:
        for p,s in enumerate(skins):
            seed=np.clip(previous[offsets[p]:offsets[p]+s.count],s.minimum+1e-8,s.maximum-1e-8)
            # A newly authored clearance path must not inherit the old leg's
            # alternative IK branch while keeping the already fitted fingers.
            reset_leg=os.environ.get('BJJ_RESET_AUTHOR_LEG') if p==0 else None
            if reset_leg:
                for k,(bone,_,_) in enumerate(s.spec):
                    if s.names[bone].endswith('.'+reset_leg) and s.names[bone].startswith(('upperleg','lowerleg','foot.')):seed[k+3]=0
            s.apply(seed)
    report=[];best=None;best_score=float('inf')
    collision,depth=contacts()
    anchors=refresh_finger_contacts(anchors);semantic=technique_contacts(t)
    roles=grip_roles()
    fractions=[float(value) for value in os.environ.get('BJJ_SWEPT_FRACTIONS','.5').split(',')]
    def path_terms():
        if not incoming:return [],[],(0.,)*6
        path_rows=[];path_goals=[];metrics=np.zeros(6)
        for fraction in fractions:
            rows,goals,values=path_constraints.terms(incoming[0],incoming[1],roles,anchors,incoming[2]+fraction*(t-incoming[2]),fraction)
            path_rows.extend(rows);path_goals.extend(goals);metrics=np.maximum(metrics,values)
        return path_rows,path_goals,tuple(metrics)
    path_rows,path_goals,path_metrics=path_terms()
    initial=(depth,
        max([np.linalg.norm(skins[0].points[v]-(w@skins[p].points[f]+sep)) for v,p,f,w,sep,_,kind in anchors if kind=='palm'],default=0),
        max([np.linalg.norm(skins[0].points[v]-(w@skins[p].points[f]+sep)) for v,p,f,w,sep,_,kind in anchors if kind=='finger'],default=0),
        max([np.linalg.norm(tw@skins[o].points[target]+sep-sw@skins[p].points[source]) for p,source,sw,o,target,tw,sep,_ in semantic],default=0),
        max(0,-.008-min(s.points[:,2].min() for s in skins)),ground_support_error(t))
    normalized=np.array([initial,path_metrics])/LIMITS
    best_score=float(normalized.max()+.01*normalized.mean()+(0 if np.all(normalized<=1) else 1))
    best=([s.basis.copy() for s in skins],[s.total.copy() for s in skins],initial)
    best_path=path_metrics;refine_frame.incoming_metrics=best_path
    keep_anchor=incoming is None and os.environ.get('BJJ_ANCHOR_FIRST')=='1' and np.all(np.array(initial)<=LIMITS)
    if keep_anchor or np.all(np.array([initial,path_metrics])<=TARGET):
        return best[0],np.concatenate(best[1]),[initial]
    for iteration in range(iterations):
        rows=list(path_rows);goals=list(path_goals)
        anchors=refresh_finger_contacts(anchors)
        semantic=technique_contacts(t)
        ground=ground_support_patches(t)
        cache_supports=[np.unique(np.concatenate([supports[p]]+[ids for person,ids in ground if person==p])) for p in range(2)]
        floors=cache_jacobians(collision,anchors,semantic,cache_supports)
        for penetration,p,v,o,face,q,n in collision:
            weights=barycentric(q,skins[o].points[face])
            jac=full_jac(p,[v])[0]-np.einsum('i,ijk->jk',weights,full_jac(o,face))
            rows.append((n@jac)[None,:]*35);goals.append(np.array([penetration+(.0015 if p==o else .003)])*35)
        for v,person,face,weights,separation,weight,kind in anchors:
            target=weights@skins[person].points[face]+separation
            error=target-skins[0].points[v]
            jac=full_jac(0,[v])[0]-np.einsum('i,ijk->jk',weights,full_jac(person,face))
            rows.append(jac*weight);goals.append(error*weight)
        for p,source,sw,o,target,tw,separation,weight in semantic:
            error=tw@skins[o].points[target]+separation-sw@skins[p].points[source]
            jac=np.einsum('i,ijk->jk',sw,full_jac(p,source))-np.einsum('i,ijk->jk',tw,full_jac(o,target))
            rows.append(jac*weight);goals.append(error*weight)
        for p,s in enumerate(skins):
            ids,base=pins[p];jac=np.zeros((len(ids),3,N));jac[:,:,offsets[p]:offsets[p]+s.count]=s.joint_jacobian(ids)
            weight=np.array([2.0 if ('leg' in s.names[i] or 'foot' in s.names[i]) and p==1 else .7 for i in ids])
            rows.append((jac*weight[:,None,None]).reshape(-1,N));goals.append(((base-s.world[ids,:3,3])*weight[:,None]).ravel())
            floor=floors[p]
            if len(floor):
                rows.append(full_jac(p,floor)[:,2,:]*35);goals.append((-.006-s.points[floor,2])*35)
            rows.append(full_jac(p,supports[p])[:,2,:]*6);goals.append((-.006-s.points[supports[p],2])*6)
        for p,ids in ground:
            rows.append(full_jac(p,ids)[:,2,:]*25);goals.append((-.006-skins[p].points[ids,2])*25)
        total=np.concatenate([s.total for s in skins]);regular=np.full(N,.025)
        regular[:3]=2;regular[offsets[1]:offsets[1]+3]=2
        rows.append(np.diag(regular));goals.append(-total*regular)
        if previous is not None:rows.append(np.eye(N)*.012);goals.append((previous-total)*.012)
        worst_depth=max(max(report[-1] if report else initial),max(path_metrics))
        angular_step=.055 if worst_depth>.025 else .025 if worst_depth>.010 else .012
        steps=np.concatenate([np.r_[np.full(3,min(.005,angular_step*.1)),np.full(s.count-3,angular_step)] for s in skins])
        lo=np.maximum(-steps,np.concatenate([s.minimum for s in skins])-total);hi=np.minimum(steps,np.concatenate([s.maximum for s in skins])-total)
        # Keep a tiny open interval at a reached bound for the BVLS backend.
        lo=np.minimum(lo,hi-1e-10)
        fit=lsq_linear(np.vstack(rows),np.concatenate(goals),bounds=(lo,hi),method='bvls',tol=1e-6,max_iter=60)
        for p,s in enumerate(skins):s.apply(fit.x[offsets[p]:offsets[p]+s.count])
        # A millimetric common root lift preserves every paired/own-body grip
        # while removing numerical floor drift. Larger errors still require IK.
        lift=max(0,-.006-min(s.points[:,2].min() for s in skins))
        if 0<lift<=.005:
            lift=min(lift,*[max(0,s.maximum[2]-s.total[2]) for s in skins])
            for s in skins:
                delta=np.zeros(s.count);delta[2]=lift;s.apply(delta)
        anchors=refresh_finger_contacts(anchors);semantic=technique_contacts(t)
        collision,depth=contacts()
        grip_error=max([np.linalg.norm(skins[0].points[v]-(w@skins[p].points[f]+sep)) for v,p,f,w,sep,_,kind in anchors if kind=='palm'],default=0)
        finger_error=max([np.linalg.norm(skins[0].points[v]-(w@skins[p].points[f]+sep)) for v,p,f,w,sep,_,kind in anchors if kind=='finger'],default=0)
        semantic_error=max([np.linalg.norm(tw@skins[o].points[target]+separation-sw@skins[p].points[source]) for p,source,sw,o,target,tw,separation,_ in semantic],default=0)
        floor_error=max(0,-.008-min(s.points[:,2].min() for s in skins))
        report.append((depth,grip_error,finger_error,semantic_error,floor_error,ground_support_error(t)))
        path_rows,path_goals,path_metrics=path_terms()
        normalized=np.array([report[-1],path_metrics])/LIMITS
        score=float(normalized.max()+.01*normalized.mean()+(0 if np.all(normalized<=1) else 1))
        if score<best_score:
            best_score=score;best=([s.basis.copy() for s in skins],[s.total.copy() for s in skins],report[-1])
            best_path=path_metrics
        if iteration%4==0:
            worst=max(collision,key=lambda r:r[0]) if collision else None
            finger_anchors=[item for item in anchors if item[-1]=='finger']
            worst_pad=max(finger_anchors,key=lambda item:np.linalg.norm(skins[0].points[item[0]]-(item[3]@skins[item[1]].points[item[2]]+item[4])),default=None)
            print('CONTACT',t,iteration,'depth',round(depth*1000,2),'palm',round(grip_error*1000,2),'pads',round(finger_error*1000,2),'lock',round(semantic_error*1000,2),'ground',round(report[-1][5]*1000,2),'incoming',round(path_metrics[0]*1000,2),len(collision),'WORST',None if worst is None else (worst[1],skins[worst[1]].dominant[worst[2]]),'PAD',None if worst_pad is None else (skins[0].dominant[worst_pad[0]],finger_regions[worst_pad[0]]),flush=True)
        if np.all(np.array([report[-1],path_metrics])<=TARGET):break
    # Contact projection is not monotonic near a bent digit. Retain the best
    # actual-skin state, rather than exporting a later, worse iteration.
    bases,totals,metrics=best
    for p,s in enumerate(skins):s.basis=bases[p];s.total=totals[p];s.forward()
    report[-1]=metrics
    refine_frame.incoming_metrics=best_path
    return [s.basis.copy() for s in skins],np.concatenate([s.total for s in skins]),report

requested=os.environ.get('BJJ_CONTACT_TIMES')
times=[float(x) for x in requested.split(',')] if requested else np.arange(0,22.0001,.25).tolist()
if os.environ.get('BJJ_CONTACT_LIBRARY')=='1':times=[]
if os.environ.get('BJJ_CONTACT_ANALYZE')=='1':
    saved=np.load(out/'contact-poses.npz');t=times[0];env['pose_at'](t)
    for s in skins:s.capture()
    frame=int(np.argmin(abs(saved['times']-t)))
    for p,s in enumerate(skins):s.basis=saved['basis'][frame,p].copy();s.forward()
    anchors=refresh_finger_contacts(grip_anchors());trees=[s.tree()[0] for s in skins]
    for v,p,face,w,sep,weight,kind in anchors:
        if kind!='finger':continue
        current=skins[0].points[v];restricted=np.linalg.norm(current-w@skins[p].points[face]);q,n,f,full=trees[p].find_nearest(Vector(current))
        print('PAD',skins[0].dominant[v],'restricted',round(restricted*1000,1),'whole',round(full*1000,1),'touches',skins[p].dominant[skins[p].faces[f]].tolist(),flush=True)
    raise SystemExit
if os.environ.get('BJJ_CONTACT_DIAGNOSE')=='1':
    for t in times:
        env['pose_at'](t)
        for s in skins:s.capture()
        records,depth=contacts()
        print('DIAGNOSE_TIME',t,'MAX',depth,flush=True)
        for d,p,v,o,face,q,n in sorted(records,key=lambda r:-r[0])[:25]:
            print('PAIR',round(d*1000,1),p,skins[p].dominant[v],o,skins[o].dominant[face].tolist(),'SOURCE',skins[p].points[v].round(3).tolist(),'SURFACE',q.round(3).tolist(),flush=True)
    raise SystemExit
frames=[];completed_times=[];stats=[];previous=None;previous_time=None;cache={};fast_installed=False;previous_roles=None
for cursor,t in enumerate(times):
    if previous_time is not None and abs(t-previous_time)>.51:previous=None
    env['pose_at'](t)
    signature=b''.join(np.array([arr(actor.pose.bones[n].matrix_basis) for n in skins[p].names]).round(9).tobytes() for p,(actor,_) in enumerate(actors))
    signature+=repr([(s,p,k,side) for s,p,k,side,_ in env['active_grips']]).encode()
    swept=os.environ.get('BJJ_SWEPT_CONTACT')=='1'
    incoming=(frames[-1],previous_roles,previous_time) if swept and frames and abs(t-previous_time)<=.51 else None
    static_cache=bool(signature in cache and incoming and previous_roles==grip_roles() and all(np.max(np.abs(np.array(a)-np.array(b)))<1e-10 for a,b in zip(frames[-1],cache[signature][1])))
    if signature in cache and (not swept or static_cache):
        cached_time,basis,previous,report=cache[signature]
        if static_cache:refine_frame.incoming_metrics=report[-1]
        print('CONTACT_CACHED',t,'from',cached_time,flush=True)
    else:
        before_previous=None if previous is None else previous.copy()
        before_seed=getattr(refine_frame,'seed_basis',None)
        if before_seed is not None:before_seed=before_seed.copy()
        adaptive=os.environ.get('BJJ_ADAPTIVE_CONTACT')=='1' and incoming and t-previous_time>1/24+1e-7
        iterations=int(os.environ.get('BJJ_CONTACT_ITERATIONS','24'))
        basis,previous,report=refine_frame(t,previous,min(iterations,16) if adaptive else iterations,incoming)
        if adaptive and not np.all(np.array([report[-1],refine_frame.incoming_metrics])<=LIMITS):
            # Keep the last accepted boundary immutable. A difficult interval
            # gets another real export-grid key instead of exhausting the
            # solver on an interpolation that needs an independent waypoint.
            midpoint=round((previous_time+t)*12)/24
            assert previous_time<midpoint<t
            times[cursor+1:cursor+1]=[midpoint,t]
            previous=before_previous
            if before_seed is not None:refine_frame.seed_basis=before_seed
            print('ADAPTIVE_CONTACT_KEY',midpoint,'before',t,'endpoint',np.round(np.array(report[-1])*1000,2).tolist(),'incoming',np.round(np.array(refine_frame.incoming_metrics)*1000,2).tolist(),flush=True)
            continue
        cache[signature]=(t,basis,previous,report)
    current_roles=grip_roles()
    if os.environ.get('BJJ_FAST_AUTHOR')=='1' and not fast_installed:
        runpy.run_path(str(ROOT/'scripts/bjj-fast-author.py'),run_name='fast_author')['install']({'env':env,'skins':skins,'actors':actors})
        fast_installed=True
    previous_time=t;previous_roles=current_roles
    frames.append(basis);completed_times.append(t);stats.append({'time':t,'iterations':len(report),'initial':report[0],'last':report[-1],'incoming':getattr(refine_frame,'incoming_metrics',(0.,)*6)})
    order=np.argsort(completed_times)
    np.savez_compressed(out/'contact-poses.npz',times=np.array(completed_times)[order],basis=np.array(frames)[order],names=np.array(skins[0].names))
    (out/'contact-refinement.json').write_text(json.dumps(stats,indent=2),encoding='utf8')
print('CONTACT_REFINEMENT_DONE',flush=True)
