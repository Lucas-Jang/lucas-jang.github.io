"""Fit a pelvic roll with an upper-back support and a soft head-height guide.

Uses actual skin and fixed-length spine bones. Upper-back height and X stay
fixed while the pelvis rises. The head can move slightly instead of forcing
the neck into an exact floor-height constraint.
"""
import os,runpy,json,math,numpy as np
from pathlib import Path
from scipy.optimize import least_squares
root=Path(__file__).resolve().parent.parent
os.environ['BJJ_CONTACT_LIBRARY']='1';os.environ['BJJ_DISABLE_HIP_ROLL']='1'
lib=runpy.run_path(str(root/'scripts/bjj-refine-contact.py'),run_name='contact_library')
runpy.run_path(str(root/'scripts/bjj-fast-author.py'),run_name='fast_author')['install'](lib)
env=lib['env'];s=lib['skins'][0];actor=s.actor;lift=.14;overhead_lift=.08
base=json.loads((root/'assets/bjj/triangle-hip-roll-base.json').read_text(encoding='utf8'))
def baseline(t):
    _,hip,angle,_,_,_,_=env['interpolate'](t);hip.y-=.13*env['smooth'](4,8,t)
    raw=max(-.22,min(.03,(.17-hip.y)/.65));beta=-math.atan(raw);bend=math.radians(4-8*min(1,t/6))
    return hip,beta,bend
def pose(hip,beta,bend,dx=0,dy=0):
    moved=hip.copy();moved.x+=dx;moved.y+=dy
    env['body_pose'](actor,dict(hip=moved,up=[-math.cos(beta),-math.sin(beta),0],forward=[0,1,0],bend=math.degrees(bend),neck=-3))
    s.basis=np.array([np.array(actor.pose.bones[n].matrix_basis) for n in s.names]);s.forward()
hip,beta,bend=baseline(4);pose(hip,beta,bend)
back=np.flatnonzero(np.array([n.startswith(('spine01','spine02')) for n in s.dominant])&(s.normals[:,1]>.5)&(abs(s.v[:,0])<.06))
head=np.flatnonzero((s.dominant=='head')&(s.normals[:,1]>.6)&(abs(s.v[:,0])<.06))
back=back[np.argsort(s.points[back,2])[:8]];head=head[np.argsort(s.points[head,2])[:8]]
assert len(back)>=3 and len(head)>=3
def anchors():return np.array([s.points[back,2].mean(),s.points[head,2].mean(),s.points[back,0].mean(),np.mean([s.world[s.lookup['upperleg01.'+side],2,3] for side in ['L','R']])])
result=[];maximum=0;maximum_head=0;previous=None
for frame in range(24,73):
    t=frame/12;hip,beta0,bend0=baseline(t);roll=math.sin(math.pi*env['smooth'](2,6,t))
    original=base['keys'][frame-24]
    base_x=np.array([math.radians(original[1]),math.radians(original[2]),original[3],lift*roll])
    pose(hip,*base_x);target=anchors()
    extra=overhead_lift*math.sin(math.pi*env['smooth'](3.5,6,t));target[3]+=extra
    if extra<1e-7:x=base_x.copy();error=0
    else:
        guess=base_x+np.array([0,0,0,extra]) if previous is None else previous
        def residual(x):pose(hip,*x);return (anchors()-target)*np.array([1,.1,1,1])
        def jacobian(x):
            columns=[]
            for k,h in enumerate([.0005,.0005,.0002,.0002]):
                left=x.copy();right=x.copy();left[k]-=h;right[k]+=h
                columns.append((residual(right)-residual(left))/(2*h))
            return np.array(columns).T
        fit=least_squares(residual,guess,jac=jacobian,bounds=([-.35,-.5,-.25,-.05],[1.5,1.7,.1,.4]),xtol=1e-9,ftol=1e-9,gtol=1e-9,max_nfev=80)
        x=fit.x;pose(hip,*x);difference=anchors()-target
        error=float(abs(difference[[0,2,3]]).max());maximum=max(maximum,error)
        maximum_head=max(maximum_head,float(abs(difference[1])))
    previous=x.copy();result.append([t,math.degrees(x[0]),math.degrees(x[1]),float(x[2]),float(x[3])])
data={'hipLiftMeters':lift,'overheadHipLiftMeters':overhead_lift,'rootTranslationInKeys':True,'postureBreakDegrees':15,'supportVertexIds':{'back':back.tolist(),'head':head.tolist()},'maxSupportErrorMeters':maximum,'maximumHeadHeightDriftMeters':maximum_head,'keys':result}
print('HIP_ROLL_RESULT','back',maximum,'head drift',maximum_head,'peak',result[24],flush=True)
assert maximum<.001,'Pelvic roll support fit failed'
assert maximum_head<.04,'Excessive head drift during pelvic roll'
out=root/'assets/bjj/triangle-hip-roll.json';out.write_text(json.dumps(data,indent=2),encoding='utf8')
