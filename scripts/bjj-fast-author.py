"""Equivalent authoring FK without repeated Blender dependency-graph updates.

For offline contact review only. Rendering/export continues to use Blender.
Run this file with Blender to compare the adapter against original authoring at
poses spanning every grip/leg transition before enabling it in a review job.
"""
import numpy as np
from types import SimpleNamespace
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree

class Bone:
    def __init__(self,actor,original):
        self.actor=actor;self.name=original.name;self.data=original.bone
        self._basis=original.matrix_basis.copy()
        self.parent_name=original.parent.name if original.parent else None
        self.relative=(original.parent.bone.matrix_local.inverted()@self.data.matrix_local) if original.parent else self.data.matrix_local.copy()
    @property
    def matrix_basis(self):return self._basis
    @matrix_basis.setter
    def matrix_basis(self,value):self._basis=value.copy();self.actor.cache.clear()
    @property
    def rotation_quaternion(self):return self._basis.to_quaternion()
    @rotation_quaternion.setter
    def rotation_quaternion(self,value):
        location,_,scale=self._basis.decompose();self.matrix_basis=Matrix.LocRotScale(location,value,scale)
    @property
    def matrix(self):
        if self.name not in self.actor.cache:
            parent=self.actor.pose.bones[self.parent_name].matrix if self.parent_name else Matrix.Identity(4)
            self.actor.cache[self.name]=parent@self.relative@self._basis
        return self.actor.cache[self.name].copy()
    @matrix.setter
    def matrix(self,value):
        parent=self.actor.pose.bones[self.parent_name].matrix if self.parent_name else Matrix.Identity(4)
        basis=(parent@self.relative).inverted()@value
        self.matrix_basis=Matrix.LocRotScale(*basis.decompose())
    @property
    def head(self):return self.matrix.translation
    @property
    def tail(self):return self.matrix@Vector((0,self.data.length,0))

class Bones(dict):
    def __iter__(self):return iter(self.values())

class Actor:
    def __init__(self,original):
        self.name=original.name;self.data=original.data;self.cache={}
        self.pose=SimpleNamespace(bones=Bones())
        self.pose.bones.update({b.name:Bone(self,b) for b in original.pose.bones})

def install(lib):
    env=lib['env'];g=env['pose_at'].__globals__;skins=lib['skins']
    # Calibrate material grip frames once through the original evaluated skin.
    env['pose_at'](0)
    original=list(lib['actors']);original_bpy=g['bpy'];original_surface=g['skin_surface']
    lib['actors'][:]=[(Actor(actor),mesh) for actor,mesh in original]
    for p,s in enumerate(skins):s.actor=lib['actors'][p][0]
    g['bpy']=SimpleNamespace(context=SimpleNamespace(view_layer=SimpleNamespace(update=lambda:None)))
    polygons={}
    def surface(person,part,side=None):
        s=skins[person];actor,mesh=lib['actors'][person];key=(person,part,side)
        if key not in polygons:
            if part=='head':mask=s.v[:,2]>env['rest_joints']['neck03____head'].z
            elif part=='hip':
                centre=np.array(env['rest_joints'][f'upperleg01.{side}____head'])
                allowed=[i for i,n in enumerate(s.names) if n.startswith(('root','pelvis','spine05',f'upperleg01.{side}',f'upperleg02.{side}'))]
                mask=(np.linalg.norm(s.v[:,:3]-centre,axis=1)<.25)&((s.weights*np.isin(s.ids,allowed)).sum(1)>.45)
            else:
                prefixes=[f'{"upperleg02" if part=="knee" else part+"01"}.{side}',f'{"lowerleg01" if part=="knee" else part+"02"}.{side}']
                if part=='knee':prefixes.append(f'lowerleg02.{side}')
                weights=(s.weights*np.isin(s.ids,[s.lookup[n] for n in prefixes])).sum(1)
                mask=weights>.45
                if part=='knee':mask&=np.linalg.norm(s.v[:,:3]-np.array(env['rest_joints'][f'lowerleg01.{side}____head']),axis=1)<.18
            polygons[key]=[list(p.vertices) for p in mesh.data.polygons if mask[list(p.vertices)].all()]
        s.basis=np.array([np.array(actor.pose.bones[n].matrix_basis) for n in s.names]);s.forward()
        return BVHTree.FromPolygons(s.points.tolist(),polygons[key])
    g['skin_surface']=surface
    def restore():
        lib['actors'][:]=original
        for p,s in enumerate(skins):s.actor=original[p][0]
        g['bpy']=original_bpy;g['skin_surface']=original_surface
    return restore

if __name__=='__main__':
    import os,runpy,json,time
    from pathlib import Path
    root=Path(__file__).resolve().parent.parent
    os.environ['BJJ_CONTACT_LIBRARY']='1'
    lib=runpy.run_path(str(root/'scripts/bjj-refine-contact.py'),run_name='contact_library')
    times=[0,2.25,2.5,3.25,3.333333,4.25,5.25,5.5,5.75,6.125,8.75,10.5,12,14.25,15,16.5,19,22]
    def snapshot(t):
        lib['env']['pose_at'](t)
        bases=[];points=[]
        for s in lib['skins']:s.capture();bases.append(s.basis.copy());points.append(s.points.copy())
        targets=[np.array(grip[0]) for *_,grip in lib['env']['active_grips']]
        return bases,points,targets
    start=time.perf_counter();reference=[snapshot(t) for t in times];slow=time.perf_counter()-start
    restore=install(lib);start=time.perf_counter();maximum_basis=maximum_skin=maximum_target=0
    for t,expected in zip(times,reference):
        actual=snapshot(t)
        difference=np.array([np.max(np.abs(a-b)) for a,b in zip(actual[0],expected[0])])
        if difference.max()>.0001:
            for p in range(2):
                bone=int(np.max(np.abs(actual[0][p]-expected[0][p]),axis=(1,2)).argmax())
                print('FAST_AUTHOR_DIFFERENCE',t,p,lib['skins'][p].names[bone],float(difference[p]),flush=True)
        for a,b in zip(actual[0],expected[0]):maximum_basis=max(maximum_basis,float(np.max(np.abs(a-b))))
        for a,b in zip(actual[1],expected[1]):maximum_skin=max(maximum_skin,float(np.max(np.linalg.norm(a-b,axis=1))))
        for a,b in zip(actual[2],expected[2]):maximum_target=max(maximum_target,float(np.linalg.norm(a-b)))
    fast=time.perf_counter()-start;restore()
    result={'samples':len(times),'maximumBasisComponentError':maximum_basis,'maximumSkinErrorMeters':maximum_skin,'maximumGripTargetErrorMeters':maximum_target,'secondsOriginal':slow,'secondsAdapter':fast}
    print('FAST_AUTHOR_PARITY',json.dumps(result),flush=True)
    (lib['out']/'fast-author-parity.json').write_text(json.dumps(result,indent=2))
    assert maximum_basis<.0001 and maximum_skin<.00003 and maximum_target<.00003,result
