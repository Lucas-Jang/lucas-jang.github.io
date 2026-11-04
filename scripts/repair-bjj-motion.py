"""Offline coupled IK: visible limb volumes, other limbs and continuous paths.

Requires numpy + scipy. Bone lengths are analytic constraints, never penalties.
The output remains ordinary baked data; the browser has no Python dependency.
"""
import json, sys, pathlib, time, os
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

ROOT=pathlib.Path(__file__).resolve().parent.parent
path=ROOT/'src/scripts/bjj-motion-data.ts'
source=path.read_text(encoding='utf-8');data=json.loads(source.split('=',1)[1].strip().removesuffix(';'))
backup=ROOT/'.astro/bjj-before-volume-repair.json'
if not backup.exists(): backup.write_text(json.dumps(data),encoding='utf-8')
if os.environ.get('BJJ_MOTION_SOURCE'): data=json.loads(pathlib.Path(os.environ['BJJ_MOTION_SOURCE']).read_text(encoding='utf-8'))
selected=sys.argv[1:] or ['triangle','double','armbar','omoplata','bow']
owner=np.repeat(np.arange(2),4);limb=np.tile(np.arange(4),2)
leg=limb>=2;l1=np.where(leg,.47,.36);l2=np.where(leg,.46,.34)
minimum=np.sqrt(l1*l1+l2*l2-2*l1*l2*np.cos(np.deg2rad(25)))
maximum=np.sqrt(l1*l1+l2*l2-2*l1*l2*np.cos(np.deg2rad(169)))
boneowner=np.repeat(owner,2);bonelimb=np.repeat(limb,2);part=np.tile([0,1],8)
radius=np.where(bonelimb>=2,np.where(part==0,.094,.076),np.where(part==0,.073,.060))
sample=np.linspace(0,1,17)
NS=len(sample)
shapeowner=np.repeat(np.arange(2),4)
shapeheight=np.tile([.27,.02,.58,.73],2)
shaperadii=np.tile([[.2034,.18,.1494],[.21,.15,.145],[.07,.10,.07],[.15,.177,.145]],(2,1))
shapehalf=np.tile([.1,0,0,0],2);shapesmall=shaperadii.min(axis=1)
ii,jj=np.triu_indices(16,1)
keep=~((boneowner[ii]==boneowner[jj])&(bonelimb[ii]==bonelimb[jj]))
ii,jj=ii[keep],jj[keep]
connected=(boneowner[ii]==boneowner[jj])&(part[ii]==0)&(part[jj]==0)&(bonelimb[ii]//2==bonelimb[jj]//2)
point_t=np.tile(sample,16)
own=(np.repeat(boneowner,NS)[:,None]==shapeowner[None,:])
prox=np.repeat(part==0,NS)&(point_t*np.repeat(np.where(bonelimb>=2,.47,.36),NS)<np.repeat(np.where(bonelimb>=2,.28,.15),NS))
skip=own&prox[:,None]&np.isin(np.arange(8)%4,[0,1])[None,:]

def unit(a): return a/np.maximum(np.linalg.norm(a,axis=-1,keepdims=True),1e-12)
_i=np.arange(42);_y=1-2*(_i+.5)/42;_r=np.sqrt(1-_y*_y);_angle=_i*2.399963229728653
directions=np.stack([_r*np.cos(_angle),_y,_r*np.sin(_angle)],axis=1)
tipradii=np.where(leg[:,None],np.array([.067,.055,.12]),np.array([.061,.072,.047]))
tip_small=tipradii.min(axis=1)
def fields(points,centres,rotations,radii,halves,small):
 local=np.einsum('pni,nij->pnj',points[:,None,:]-centres[None,:,:],rotations)
 local[:,:,1]-=np.clip(local[:,:,1],-halves,halves)
 return (np.linalg.norm(local/radii[None,:,:],axis=2)-1)*small
def segment_pairs(a,b):
 u=b[ii]-a[ii];v=b[jj]-a[jj];w=a[ii]-a[jj]
 aa=(u*u).sum(1);bb=(u*v).sum(1);cc=(v*v).sum(1);dd=(u*w).sum(1);ee=(v*w).sum(1)
 den=aa*cc-bb*bb;s=np.clip(np.divide(bb*ee-cc*dd,den,out=np.zeros_like(den),where=den>1e-12),0,1)
 t=(bb*s+ee)/cc;low=t<0;high=t>1;s=np.where(low,np.clip(-dd/aa,0,1),np.where(high,np.clip((bb-dd)/aa,0,1),s));t=np.clip(t,0,1)
 p=a[ii]+s[:,None]*u;q=a[jj]+t[:,None]*v
 return np.linalg.norm(p-q,axis=1),s,t

def solve_clip(key):
 frames=np.asarray(data[key],dtype=float);output=frames.tolist();previous=None;previous_ref=None;previous_shift=np.zeros((2,3));started=time.time()
 ids=[int(os.environ['BJJ_REPAIR_FRAME'])] if os.environ.get('BJJ_REPAIR_FRAME') else range(len(frames))
 if key=='triangle' and not os.environ.get('BJJ_REPAIR_FRAME'): ids=range(len(frames)-1,-1,-1)
 if os.environ.get('BJJ_REPAIR_RANGE'):
  lo,hi=map(int,os.environ['BJJ_REPAIR_RANGE'].split(':'))
  ids=range(hi,lo-1,-1) if key=='triangle' or os.environ.get('BJJ_REPAIR_DIRECTION')=='backward' else range(lo,hi+1)
 for f in ids:
  people=frames[f]
  p=f/(len(frames)-1);positions=people[:,:3];rot=Rotation.from_quat(people[:,3:7]).as_matrix()
  raw=people[:,7:].reshape(8,16);start=raw[:,:3];refjoint=raw[:,3:6];refend=raw[:,6:9]
  centres=positions[shapeowner]+rot[shapeowner,:,1]*shapeheight[:,None];sr=rot[shapeowner]
  refaxis=unit(refend-start);refbend=unit(refjoint-start-refaxis*((refjoint-start)*refaxis).sum(1)[:,None])
  def decode(x):
   values=x[:32].reshape(8,4);shift=x[32:].reshape(2,3);starts=start+shift[owner]
   delta=values[:,:3]-starts;distance=np.clip(np.linalg.norm(delta,axis=1),minimum+.001,maximum)
   axis=unit(delta);end=starts+axis*distance[:,None]
   basis=unit(refbend-axis*(refbend*axis).sum(1)[:,None]);tangent=np.cross(axis,basis)
   along=(l1*l1-l2*l2+distance*distance)/(2*distance);r=np.sqrt(np.maximum(0,l1*l1-along*along))
   joint=starts+axis*along[:,None]+r[:,None]*(basis*np.cos(values[:,3,None])+tangent*np.sin(values[:,3,None]))
   return starts,joint,end,shift
  last_quality=[float('inf')]*5
  def residual(x):
   starts,joint,end,shift=decode(x);a=np.empty((16,3));b=np.empty((16,3));a[0::2]=starts;a[1::2]=joint;b[0::2]=joint;b[1::2]=end
   points=(a[:,None,:]+(b-a)[:,None,:]*sample[None,:,None]).reshape(-1,3)
   centres_now=centres+shift[shapeowner]
   distances=fields(points,centres_now,sr,shaperadii,shapehalf,shapesmall)
   penetration=np.maximum(0,np.repeat(radius,NS)[:,None]+.009-distances);penetration[skip]=0
   gaps,s,t=segment_pairs(a,b);cross=np.maximum(0,radius[ii]+radius[jj]+.008-gaps);cross[connected&(s<.2)&(t<.2)]=0
   shin=unit(joint-end);toe=rot[owner,:,2];toe=unit(toe-shin*(toe*shin).sum(1)[:,None]);tiprot=np.stack([np.cross(shin,toe),shin,toe],axis=2)
   bone_tip=np.maximum(0,np.repeat(radius,NS)[:,None]+.009-fields(points,end,tiprot,tipradii,np.zeros(8),tip_small))
   bone_tip[(np.repeat(boneowner,NS)[:,None]==owner)&(np.repeat(bonelimb,NS)[:,None]==limb)]=0
   tip_points=end[:,None,:]+np.einsum('nij,ndj->ndi',tiprot,tipradii[:,None,:]*directions[None,:,:])
   tip_body=np.maximum(0,.009-fields(tip_points.reshape(-1,3),centres_now,sr,shaperadii,shapehalf,shapesmall))
   tip_tip=np.maximum(0,.008-fields(tip_points.reshape(-1,3),end,tiprot,tipradii,np.zeros(8),tip_small))
   tip_tip[np.repeat(np.arange(8),len(directions))[:,None]==np.arange(8)]=0
   body_points=centres_now[:,None,:]+np.einsum('nij,ndj->ndi',sr,shaperadii[:,None,:]*directions[None,:,:]+np.array([0,1,0])[None,None,:]*np.sign(directions[None,:,1,None])*shapehalf[:,None,None])
   body_body=np.maximum(0,.009-fields(body_points.reshape(-1,3),centres_now,sr,shaperadii,shapehalf,shapesmall))
   body_body[np.repeat(shapeowner,len(directions))[:,None]==shapeowner]=0
   body_extent=np.sqrt(((sr[:,1,:]*shaperadii)**2).sum(1))+np.abs(sr[:,1,1])*shapehalf
   body_floor=np.maximum(0,-.015+.004+body_extent-centres_now[:,1])
   floorj=np.maximum(0,np.where(leg,.084,.061)-joint[:,1]);floore=np.maximum(0,np.where(leg,.115,.064)-end[:,1])
   # Preserve intended contacts without forcing impossible, penetrating targets.
   anchors=[]
   if key=='triangle': anchors.append(np.linalg.norm(end[0]-end[4])-.125)
   if key=='armbar': anchors.extend([np.linalg.norm(end[0]-end[4])-.125,np.linalg.norm(end[1]-end[4])-.125])
   if key=='omoplata' and (p<=.25 or p>=.70): anchors.append((np.linalg.norm(end[1]-end[4])-.125)*(1 if p<=.25 else min(1,(p-.70)/.09)))
   lock=[]
   if key=='triangle' and p>=.72: lock.append((np.linalg.norm(end[2]-joint[3])-.18)*min(1,(p-.72)/.15))
   support=[]
   if key=='omoplata' and .35<p<.68: support.append((end[1,1]-.075)*2)
   hip_support=[]
   if key=='triangle' and p<.25:
    weight=min(1,max(0,(.25-p)/.06))
    target=positions[1]+shift[1]+rot[1]@np.array([-.29,.04,.03])
    hip_support=(end[3]-target)*weight*40
   s_mount=[];s_error=0
   if key=='armbar' and .23<p<.48:
    weight=min(1,(p-.23)/.07)*min(1,(.48-p)/.08)
    head=positions[1]+shift[1]+rot[1,:,1]*.73
    target=head-rot[1,:,0]*.34-rot[1,:,1]*.10
    s_mount=(joint[2]-target)*weight*70;s_error=np.linalg.norm(s_mount)/70
   seated=[];seat_error=0
   if key=='armbar' and .56<p<.69:
    weight=min(1,(p-.56)/.04)*min(1,(.69-p)/.05)
    seat_error=abs(positions[0,1]+shift[0,1]-.30)*weight
    seated=[(positions[0,1]+shift[0,1]-.30)*weight*50]
   boundary=[]
   if os.environ.get('BJJ_REPAIR_RANGE'):
    lo,hi=map(int,os.environ['BJJ_REPAIR_RANGE'].split(':'))
    weight=max(max(0,1-(f-lo)/12) if lo>0 else 0,max(0,1-(hi-f)/12) if hi<len(frames)-1 else 0)
    boundary=np.r_[((joint-refjoint)*50*weight).ravel(),((end-refend)*50*weight).ravel(),(shift*50*weight).ravel()]
   deviation=(end-refend)*np.where(leg[:,None],1.5,3)
   continuity=[]
   if previous is not None:
    predictedj=previous[0]+refjoint-previous_ref[0];predictede=previous[1]+refend-previous_ref[1]
    continuity=np.r_[np.concatenate(((joint-predictedj).ravel(),(end-predictede).ravel()))*12,np.maximum(0,np.linalg.norm(joint-previous[0],axis=1)-.035)*1600,np.maximum(0,np.linalg.norm(end-previous[1],axis=1)-.035)*1600]
   geometry=np.concatenate([penetration.ravel(),cross,bone_tip.ravel(),tip_body.ravel(),tip_tip.ravel(),body_body.ravel(),body_floor,floorj,floore])
   jump=max(np.linalg.norm(joint-previous[0],axis=1).max(),np.linalg.norm(end-previous[1],axis=1).max()) if previous is not None else 0
   last_quality[:]=[np.max(geometry),np.max(np.abs(anchors)) if anchors else 0,abs(np.linalg.norm(end[2]-joint[3])-.18) if key=='triangle' and p>.93 else 0,max(s_error,seat_error*2,np.linalg.norm(hip_support)/40 if len(hip_support) else 0),jump]
   return np.concatenate([geometry*900,np.asarray(anchors)*250,np.asarray(lock)*400,np.asarray(support)*15,hip_support,s_mount,seated,boundary,deviation.ravel(),((joint-refjoint)*.25).ravel(),(shift*8).ravel(),((shift-previous_shift)*12).ravel(),continuity])
  def sufficient(x):
   residual(x)
   if last_quality[0]<.0025 and last_quality[1]<.02 and last_quality[2]<.012 and last_quality[3]<.04 and last_quality[4]<.065: raise StopIteration
  x=np.r_[np.column_stack([refend,np.zeros(8)]).ravel(),np.zeros(6)]
  if key=='triangle' and f==len(frames)-1 and not os.environ.get('BJJ_REPAIR_FRAME'):
   seed=frames[-1] if os.environ.get('BJJ_REPAIR_POLISH') else np.asarray(json.loads((ROOT/'scripts/bjj-triangle-seed.json').read_text()))[-1]
   seedraw=seed[:,7:].reshape(8,16);x[:32].reshape(8,4)[:,:3]=seedraw[:,6:9]
   axis=unit(seedraw[:,6:9]-start);basis=unit(refbend-axis*(refbend*axis).sum(1)[:,None]);tangent=np.cross(axis,basis)
   bend=unit(seedraw[:,3:6]-start-axis*((seedraw[:,3:6]-start)*axis).sum(1)[:,None]);x[:32].reshape(8,4)[:,3]=np.arctan2((bend*tangent).sum(1),(bend*basis).sum(1))
  if previous is not None:
   x[:32].reshape(8,4)[:,:3]=previous[1]+refend-previous_ref[1];x[32:]=previous_shift.ravel()
   # Express the previous bend in the current reference frame for a warm start.
   starts=start+previous_shift[owner];axis=unit(x[:32].reshape(8,4)[:,:3]-starts);basis=unit(refbend-axis*(refbend*axis).sum(1)[:,None]);tangent=np.cross(axis,basis)
   bend=unit(previous[0]-starts-axis*((previous[0]-starts)*axis).sum(1)[:,None]);x[:32].reshape(8,4)[:,3]=np.arctan2((bend*tangent).sum(1),(bend*basis).sum(1))
  fit=least_squares(residual,x,max_nfev=55,ftol=1e-5,xtol=1e-6,gtol=1e-5,diff_step=1e-5,callback=sufficient)
  if os.environ.get('BJJ_REPAIR_FRAME'):
   rng=np.random.default_rng(22)
   for trial in range(16):
    candidate=x[:32].reshape(8,4).copy()
    candidate[:,3]=rng.uniform(-np.pi,np.pi,8)
    candidate[:,:3]+=rng.normal(0,.06,(8,3))
    if key=='triangle':
     candidate[2,:3]=[.10,.90,-.20];candidate[3,:3]=[.15,.83,.23]
    alternative=least_squares(residual,np.r_[candidate.ravel(),np.zeros(6)],max_nfev=150,ftol=1e-7,xtol=1e-7,gtol=1e-6,diff_step=1e-5)
    if alternative.cost<fit.cost: fit=alternative
    print('restart',trial,'best',fit.cost,flush=True)
  starts,joint,end,shift=decode(fit.x)
  result=people.copy();result[:,:3]+=shift;values=result[:,7:].reshape(8,16);values[:,:3]=starts;values[:,3:6]=joint;values[:,6:9]=end
  shin=unit(joint-end);toe=rot[owner,:,2];toe=unit(toe-shin*(toe*shin).sum(1)[:,None]);right=np.cross(shin,toe)
  values[:,9:13]=Rotation.from_matrix(np.stack([right,shin,toe],axis=2)).as_quat()
  # Goal diagnostics retain the authored targets, not a fabricated zero error.
  values[:,13:16]=raw[:,13:16]
  result[:,7:]=values.reshape(2,64)
  output[f]=result.tolist()
  if f%20==0:
   residual(fit.x);print(key,f,'cost',round(fit.cost,3),'quality',np.round(last_quality,4),'seconds',round(time.time()-started,1),flush=True)
  previous=(joint,end);previous_ref=(refjoint,refend);previous_shift=shift
 repaired=np.round([row for row in output if row is not None],7).tolist()
 (ROOT/f'.astro/bjj-volume-{key}.json').write_text(json.dumps(repaired,separators=(',',':')),encoding='utf-8')

for key in selected: solve_clip(key)
