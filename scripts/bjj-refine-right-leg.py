"""Refine the supporting/locking leg on the actual weighted skin.

The partner, pelvis and arms retain the source animation. The anatomically
aligned opposing leg can participate in closing. Bounded articulated controls
preserve bone lengths; a leg lock also requires the closing knee to bend.
"""
import os,runpy,json,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
from scipy.optimize import lsq_linear
from scipy.spatial.transform import Rotation

ROOT=Path(__file__).resolve().parent.parent
os.environ['BJJ_CONTACT_LIBRARY']='1'
lib=runpy.run_path(str(ROOT/'scripts/bjj-refine-contact.py'))
g=lib['contacts'].__globals__;s,b=g['skins'];env=g['env'];unit=g['unit']
Clip=runpy.run_path(str(ROOT/'scripts/bjj-contact-sample.py'))['ContactClip']
source=Path(os.environ['BJJ_CONTACT_CLIP']);clip=Clip(source)
assert clip.names==s.names
s.spec=[(s.lookup['upperleg01.R'],a,1.3) for a in np.eye(3)]+[(s.lookup['lowerleg01.R'],None,2.4)]+[(s.lookup['foot.R'],a,1.2) for a in np.eye(3)]
s.count=10;s.hinges=[3];b.spec=[];b.count=3;b.hinges=[]
for toe in range(1,6):
    name=f'toe{toe}-1.R';bone=s.actor.data.bones[name]
    direction=np.array((bone.tail_local-bone.head_local).normalized());normal=np.array(env['foot_frame']('R')[3])
    axis=unit(np.cross(direction,normal));s.spec.append((s.lookup[name],s.rest[s.lookup[name],:3,:3].T@axis,.35));s.count+=1
leftstart=s.count;coupled=os.environ.get('BJJ_COUPLED_ANKLE')=='1'
if coupled:
    s.spec.extend((s.lookup['upperleg01.L'],a,.55) for a in np.eye(3))
    s.spec.append((s.lookup['lowerleg01.L'],None,.60));s.count+=4;s.hinges.append(len(s.spec)-1)
    s.spec.extend((s.lookup['foot.L'],a,.15) for a in np.eye(3));s.count+=3
V=s.count-3;N=s.count+b.count
CONTACT_LIMIT=float(g['LIMITS'][3])
g['N']=N;g['offsets']=[0,s.count]
right=(s.weights*s.ancestors[s.ids,s.lookup['upperleg01.R']]).sum(1)>.01
# Exclude the continuous groin seam from the detached-part collision test.
dist=np.linalg.norm(s.v[:,:3]-s.rest[s.lookup['upperleg01.R'],:3,3],axis=1)
right &= dist>.13
def candidates(person,ids):
    if person==0:return ids[right[ids]]
    points=s.points[right];return ids[((b.points[ids]>=points.min(0)-.004)&(b.points[ids]<=points.max(0)+.004)).all(1)]
g['contact_vertex_filter']=candidates
g['contact_record_filter']=lambda p,v,o,face:(p==0 and right[v]) or (o==0 and right[face].any())
raw_contacts=g['contacts']
def right_contacts():
    records,_=raw_contacts()
    records=[r for r in records if (r[1]==0 and right[r[2]]) or (r[3]==0 and right[r[4]].any())]
    return records,max([r[0] for r in records],default=0.)
g['contacts']=right_contacts
g['contact_pair_filter']=lambda p,a,c:p==0 and (a in ['calf.R','foot.R'] or c=='leg.R')
g['extra_self_pairs']=lambda p:[('foot.R','body')] if p==0 else []
g['floor_vertex_filter']=lambda p,ids:ids[right[ids]] if p==0 else np.array([],int)
env['floor_contacts']=lambda t:[]
g['floor_error']=lambda:max(0.,float(-.008-s.points[right,2].min()))
env['hip_post_blend']=lambda t:env['smooth'](1.5,2.5,t)*(1-env['smooth'](13.5,14.5,t))
sole=np.array(env['foot_frame']('R')[4],int)
achilles=g['patch'](0,env['rest_joints']['foot.L____head']+Vector((0,.024,.025)),('lowerleg02.L','foot.L'))
material=np.array(env['foot_frame']('R')[2]);restfoot=s.rest[s.lookup['foot.R'],:3,:3]
jointids=np.array([s.lookup[n+'.R'] for n in ['upperleg01','lowerleg01','foot']])
kneerest=s.rest[jointids[1],:3,3]
capids=np.flatnonzero((np.linalg.norm(s.v[:,:3]-kneerest,axis=1)<.075)&(s.v[:,1]<kneerest[1]-.015)&(s.normals[:,1]<-.4))
original_gaps=[];reference_flex=[]
for t in clip.times:
    amounts=[env['hip_post_blend'](t),env['smooth'](13.5,16,t)]
    # Include the boundary keys: zero placeholders there create an artificial
    # distance dip between the first closing key and its preceding key.
    if not (1.5<=t<=2.5 or 13.5<=t<=16):original_gaps.append([0,0]);reference_flex.append(0.);continue
    bases=clip.sample(t)
    for p,skin in enumerate([s,b]):skin.basis=bases[p];skin.forward()
    hip,_=b.tree('hip','L');knee,_=s.tree('kneepit','R')
    original_gaps.append([hip.find_nearest(Vector(s.points[sole].mean(0)))[3],knee.find_nearest(Vector(s.points[achilles].mean(0)))[3]])
    h,k,f=s.world[jointids,:3,3];reference_flex.append(float(np.degrees(np.arccos(np.clip(unit(k-h)@unit(f-k),-1,1)))))
original_gaps=np.array(original_gaps)
def minimum_flex(t):return 110. if t>=16 else max(5.,110.*env['smooth'](13.5,16,t)) if t>13.5 else 0.
def semantic(t):
    result=[];plant=env['hip_post_blend'](t);close=env['smooth'](13.5,16,t)
    for amount,ids,target,part,side,index in [(plant,sole,b,'hip','L',0),(close,achilles,s,'kneepit','R',1)]:
        if amount<=0:continue
        # During approach the foot is free to travel outside the body. A
        # partial hip patch has no closed inside volume and cannot require
        # the airborne foot to contact the hip before the support phase.
        if index==0 and amount<.999:continue
        centre=s.points[ids].mean(0);tree,subset=target.tree(part,side)
        q,n,f,d=tree.find_nearest(Vector(centre));q=np.array(q);n=np.array(n)
        reference_gap=np.interp(t,clip.times,original_gaps[:,index])
        if index==1:
            # The guide already closes the leg. Scaling its changing distance
            # by (1-close) closes twice as fast and traps the ankle before the
            # supporting foot has completed its outside path. Remove only the
            # guide's remaining terminal gap, smoothly over the closing phase.
            terminal_gap=np.interp(16,clip.times,original_gaps[:,index])
            gap=max(0.,reference_gap-amount*terminal_gap)+.0025
        else:gap=(1-amount)*reference_gap+.0025
        # A kneepit patch is open. Its normal is not an inside test while
        # the other ankle is still approaching from far away.
        outside=amount<.999 or (centre-q)@n>=0
        if outside and d<=gap:continue
        sep=unit(centre-q)*gap if outside else n*.0025
        face=target.faces[subset[f]]
        result.append((0,ids,np.ones(len(ids))/len(ids),1 if target is b else 0,face,g['barycentric'](q,target.points[face]),sep,28))
    return result
g['technique_contacts']=semantic
def orientation(t):
    h,k,f=s.world[jointids,:3,3];u=k-h;v=f-k;n=unit(np.cross(u,v));shin=unit(v)
    rotation=s.world[jointids[2],:3,:3]@restfoot.T
    lateral,forward,normal=(rotation@material).T
    jac=s.joint_jacobian(jointids)[:,:,3:];du=jac[1]-jac[0];dv=jac[2]-jac[1]
    cross=np.cross(u,v);dc=np.cross(du.T,v).T+np.cross(u,dv.T).T
    dn=(dc-n[:,None]*(n@dc))/np.linalg.norm(cross)
    attached=np.array([s.ancestors[jointids[2],bone] for bone,_,_ in s.spec])
    dl=np.cross(s.axes,lateral).T*attached;df=np.cross(s.axes,forward).T*attached
    ds=(dv-shin[:,None]*(shin@dv))/np.linalg.norm(v)
    facing=float(lateral@n);toe=float(forward@shin)
    upper=unit(u);cosine=float(np.clip(upper@shin,-1,1));flex=float(np.arccos(cosine))
    dupper=(du-upper[:,None]*(upper@du))/np.linalg.norm(u)
    dflex=-(shin@dupper+upper@ds)/max(1e-6,np.sqrt(1-cosine*cosine))
    axis=unit(f-h);daxis=jac[2]-jac[0];daxis=(daxis-axis[:,None]*(axis@daxis))/np.linalg.norm(f-h)
    def projected(value,derivative):
        projected=value-axis*(value@axis)
        derivative=derivative-daxis*(value@axis)-axis[:,None]*(axis@derivative+value@daxis)
        direction=unit(projected)
        return direction,(derivative-direction[:,None]*(direction@derivative))/np.linalg.norm(projected)
    bend,dbend=projected(k-h,jac[1]-jac[0])
    cap,dcap=projected(s.points[capids].mean(0)-k,s.point_jacobian(capids).mean(0)[:,3:]-jac[1])
    capfacing=float(cap@bend)
    rows=[];goals=[]
    def add(jac,error):
        row=np.zeros((1,N));row[0,3:s.count]=jac*2.5;rows.append(row);goals.append(np.array([error*2.5]))
    if facing<.82:add(n@dl+lateral@dn,.82-facing)
    if capfacing<.45:add(cap@dbend+bend@dcap,.45-capfacing)
    if t>13.5:
        progress=env['smooth'](13.5,16,t);initial=np.interp(13.5,clip.times,reference_flex)
        wanted=np.radians((1-progress)*initial+progress*120.)
        if flex<wanted:add(dflex*progress**2,(wanted-flex)*progress**2)
    if toe<-.55:add(shin@df+forward@ds,-.55-toe)
    if toe>.75:add(shin@df+forward@ds,.75-toe)
    plant=env['hip_post_blend'](t)
    if plant>.99:
        tree,_=b.tree('hip','L');_,outward,_,_=tree.find_nearest(Vector(s.points[sole].mean(0)))
        outward=np.array(outward);dot=float(normal@outward)
        if dot>-.75:add(outward@(np.cross(s.axes,normal).T*attached),-.75-dot)
    return rows,goals,(facing,toe,capfacing,float(np.degrees(flex)))
g['extra_path_constraints']=lambda t:orientation(t)[:2]
path=g['path_constraints'];records=[];frames=[];previous=None;previous_time=None;last_control=None
times=np.array([float(x) for x in os.environ['BJJ_RIGHT_TIMES'].split(',')]) if os.environ.get('BJJ_RIGHT_TIMES') else clip.times
if os.environ.get('BJJ_RIGHT_LIBRARY')=='1':times=[]
if os.environ.get('BJJ_RIGHT_RESUME')=='1':
    saved=Clip(g['out']/'contact-poses.npz');frames=list(saved.bases);previous=frames[-1].copy();previous_time=float(saved.times[-1])
    records=json.loads((g['out']/'right-contact-state.json').read_text())['frames']
    while records and not records[-1]['passed']:records.pop();frames.pop()
    if os.environ.get('BJJ_RIGHT_RESUME_UNTIL'):
        while records and records[-1]['time']>float(os.environ['BJJ_RIGHT_RESUME_UNTIL'])+1e-8:records.pop();frames.pop()
    previous=frames[-1].copy();previous_time=float(records[-1]['time'])
    assert len(records)==len(frames) and all(r['passed'] for r in records)
    times=times[times>previous_time+1e-8]
completed_times=[r['time'] for r in records]
motion_ids=np.array([s.lookup[n] for n in ['lowerleg01.R','foot.R','lowerleg01.L','foot.L']])
def joint_world(basis):
    world=np.empty_like(s.rest)
    for i,p in enumerate(s.parents):world[i]=(world[p]@s.relative[i] if p>=0 else s.relative[i])@basis[i]
    return world[motion_ids,:3,3]
for t in times:
    bases=clip.sample(t)
    for p,skin in enumerate([s,b]):skin.capture(bases[p])
    if coupled and t<13.5:s.minimum[leftstart:]=-.000000001;s.maximum[leftstart:]=.000000001
    target=s.world[jointids[1:],:3,3].copy()
    guide_joints=s.world[motion_ids,:3,3].copy();motion_target=None;previous_joints=None;step_limit=None
    if previous is not None:
        previous_joints=joint_world(previous[0]);dt=float(t-previous_time);step_limit=1.44*dt
        direction=guide_joints-previous_joints;distance=np.linalg.norm(direction,axis=1)
        motion_target=previous_joints+direction*np.minimum(1.,.96*dt/np.maximum(distance,1e-12))[:,None]
    neck_pin=None
    if coupled:
        neck=g['patch'](1,env['rest_joints']['neck03____head']+Vector((0,.04,0)),('neck','head'))
        tree,subset=s.tree('lowerleg','L');q,_,f,_=tree.find_nearest(Vector(b.points[neck].mean(0)))
        face=s.faces[subset[f]];weights=g['barycentric'](np.array(q),s.points[face]);neck_pin=(face,weights,np.array(q))
    # Start from the reviewed guide. Carrying an earlier support correction
    # into the closing pose can select another IK branch even when the guide
    # itself already has valid contact. Incoming surface checks still apply.
    warm_enabled=os.environ.get('BJJ_RIGHT_WARM')=='1'
    if previous is not None and warm_enabled:
        oldseed=clip.sample(previous_time)[0]
        vectors=Rotation.from_matrix(np.swapaxes(oldseed[:,:3,:3],1,2)@previous[0,:,:3,:3]).as_rotvec()
        last_control=np.array([vectors[bone]@axis for bone,axis,_ in s.spec])
    if last_control is not None and warm_enabled:
        warm=np.zeros(s.count);decay=1 if t>=16 else .95
        warm[3:]=np.clip(last_control*decay,s.minimum[3:]+1e-10,s.maximum[3:]-1e-10);s.apply(warm)
    best=None
    for iteration in range(int(os.environ.get('BJJ_RIGHT_ITERATIONS','100'))):
        g['vertex_jacobian_cache']=None
        collision,depth=g['contacts']();sem=semantic(t)
        floors=g['cache_jacobians'](collision,[],sem,[np.array([],int)]*2)
        rows=[];goals=[]
        for penetration,p,v,o,face,q,n in collision:
            w=g['barycentric'](q,[s,b][o].points[face]);jac=g['full_jac'](p,[v])[0]-np.einsum('i,ijk->jk',w,g['full_jac'](o,face))
            rows.append((n@jac)[None,:]*65);goals.append(np.array([penetration+.0015])*65)
        errors=[]
        for p,ids,sw,o,face,tw,sep,weight in sem:
            error=tw@[s,b][o].points[face]+sep-sw@s.points[ids];errors.append(np.linalg.norm(error))
            jac=np.einsum('i,ijk->jk',sw,g['full_jac'](p,ids))-np.einsum('i,ijk->jk',tw,g['full_jac'](o,face))
            rows.append(jac*weight*2.5);goals.append(error*weight*2.5)
        if len(floors[0]):rows.append(g['full_jac'](0,floors[0])[:,2,:]*35);goals.append((-.006-s.points[floors[0],2])*35)
        rr,gg,angles=orientation(t);rows.extend(rr);goals.extend(gg)
        current_joints=s.world[motion_ids,:3,3];maximum_step=0.
        if motion_target is not None:
            joint_jac=np.zeros((len(motion_ids),3,N));joint_jac[:,:,:s.count]=s.joint_jacobian(motion_ids)
            rows.append(joint_jac.reshape(-1,N)*8);goals.append((motion_target-current_joints).ravel()*8)
            maximum_step=float(np.linalg.norm(current_joints-previous_joints,axis=1).max())
        if neck_pin:
            ids,w,position=neck_pin;jac=np.zeros((3,N));jac[:,:s.count]=np.einsum('i,ijk->jk',w,s.point_jacobian(ids))
            rows.append(jac*3);goals.append((position-w@s.points[ids])*3)
        metrics=np.array([depth,max(errors,default=0),g['floor_error']()])
        if previous is not None and abs(t-previous_time-1/24)<1e-7:
            for fraction in [.25,.5,.75]:
                rr,gg,mm=path.terms(previous,{}, {},[],float(t-(1-fraction)/24),fraction)
                rows.extend(rr);goals.extend(gg);metrics=np.maximum(metrics,[mm[0],mm[3],mm[4]])
        motion_ok=step_limit is None or maximum_step<=step_limit
        depth_limit=float(os.environ.get('BJJ_RIGHT_DEPTH_LIMIT','.0025'))
        feasible=bool(np.all(metrics<=np.array([depth_limit,CONTACT_LIMIT,.002])) and angles[0]>=.70 and -.60<=angles[1]<=.80 and angles[2]>=.25 and angles[3]>=minimum_flex(t) and motion_ok)
        score=max(float((metrics/np.array([depth_limit,CONTACT_LIMIT,.002])).max()),maximum_step/step_limit if step_limit else 0)+max(0,.70-angles[0])*10+max(0,-.60-angles[1],angles[1]-.80)*10+max(0,.25-angles[2])*10+max(0,minimum_flex(t)-angles[3])*.1
        if best is None or (not best[0] and feasible) or (best[0]==feasible and score<best[1]):best=(feasible,score,s.basis.copy(),s.total.copy(),metrics.copy(),angles,maximum_step)
        if feasible:break
        jac=s.joint_jacobian(motion_ids)[:,:,3:].reshape(-1,V)
        a=np.concatenate([r[:,3:s.count] for r in rows]+[jac*3,np.eye(V)*.035]);y=np.concatenate(goals+[(guide_joints-s.world[motion_ids,:3,3]).ravel()*3,-s.total[3:]*.035])
        step=.045 if metrics.max()>.02 else .022
        lo=np.maximum(-step,s.minimum[3:]-s.total[3:]);hi=np.minimum(step,s.maximum[3:]-s.total[3:]);hi=np.maximum(hi,lo+1e-10)
        delta=lsq_linear(a,y,bounds=(lo,hi),method='bvls').x
        full=np.zeros(s.count);full[3:]=delta;s.apply(full)
    ok,score,basis,control,metrics,angles,maximum_step=best
    s.basis=basis;s.total=control;s.forward();last_control=control[3:].copy()
    frame=bases.copy();frame[0]=basis;frames.append(frame);previous=frame.copy();previous_time=t
    record={'time':float(t),'passed':ok,'iterations':iteration+1,'depth':float(metrics[0]),'contactError':float(metrics[1]),'floorError':float(metrics[2]),'ankleFacing':angles[0],'toeShinDot':angles[1],'kneecapFacing':angles[2],'kneeFlexionDegrees':angles[3],'maximumLegJointStepMeters':maximum_step};records.append(record)
    completed_times.append(float(t))
    print('RIGHT_FRAME',json.dumps(record),flush=True)
    if not ok or len(frames)%6==0 or t==times[-1]:
        np.savez_compressed(g['out']/'contact-poses.npz',times=completed_times,basis=frames,names=clip.names)
        (g['out']/'right-contact-state.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'scope':'demonstrator right leg and toes; paired left leg only during closing; torso/arms/partner unchanged','limitsMeters':{'penetration':.0025,'contact':CONTACT_LIMIT,'floor':.002},'frames':records},indent=2))
    if not ok:
        print('RIGHT_CONTROLS',control.tolist(),'limits',s.minimum.tolist(),s.maximum.tolist(),flush=True)
        for r in sorted(g['contacts']()[0],key=lambda r:-r[0])[:8]:print('RIGHT_COLLISION',r[0],r[1],s.dominant[r[2]] if r[1]==0 else b.dominant[r[2]],r[3],[s,b][r[3]].dominant[r[4]].tolist(),flush=True)
        raise RuntimeError('Right-leg frame infeasible; stopped before propagating it')
