"""Promote the reviewed leg revision only with its matching audit evidence."""
import json,hashlib,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def read(path):return json.loads((ROOT/path).read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
clip=ROOT/'.astro/bjj-retimed-leg/contact-poses.npz';export=ROOT/'.astro/bjj-retimed-export';asset=export/'triangle-study.glb'
prefix=read('.astro/bjj-both-prefix-audit/right-leg-audit.json');late=read('.astro/bjj-retimed-audit/right-leg-audit.json')
knees=read('.astro/bjj-retimed-knees/knee-audit.json');parity=read('.astro/bjj-retimed-export/export-parity.json')
preserved=read('.astro/bjj-retimed-export/original-motion-parity.json');build=read('.astro/bjj-retimed-export/build-metadata.json')
prefix_parity=read('.astro/bjj-retimed-leg/prefix-audit-parity.json')
retiming=read('.astro/bjj-retimed-leg/retiming-parity.json')
assert retiming['maximumPoseBasisDifference']<1e-10
continuity=read('.astro/bjj-true-lock-smooth-fit/right-contact-state.json')
assert len(continuity['frames'])==217 and all(r['passed'] for r in continuity['frames'])
maximum_step=max(r['maximumLegJointStepMeters'] for r in continuity['frames'])
assert maximum_step<=.060001
assert not prefix['failed'] and not late['failed'] and not knees['failed']
assert late['clipSha256']==sha(clip)==build['sourceClipSha256'] and build['assetSha256']==sha(asset)
assert knees['clipSha256']==sha(clip)
clearance=read('.astro/bjj-clearance-patch/right-contact-state.json')
assert len(clearance['frames'])==3 and all(r['passed'] for r in clearance['frames'])
assert prefix_parity['maximumPoseBasisDifference']<.000001
rows=prefix['rows']+late['rows'];samples={round(r['time']*96) for r in rows}
assert samples==set(range(2113))
locked=[r for r in late['rows'] if r['sourceTime']>=16]
assert min(r['kneeFlexionDegrees'] for r in locked)>=110
assert parity['maximumSkinErrorMeters']<.0002 and parity['maximumJointPositionErrorMeters']<.0002
assert preserved['maximumUnchangedMatrixComponent']<.0002 and preserved['maximumJointCentreChangeMeters']<.0005
tap=(export/'integration.tap').read_text(encoding='utf8')
assert '# pass 5' in tap and '# fail 0' in tap
state={'status':'right-leg revision; full triangle/grip rebuild remains unfinished','durationSeconds':22,'motionSha256':sha(clip),'assetSha256':sha(asset),'sourceRuntimeSha256':sha(ROOT/'.astro/bjj-current-runtime/original.glb'),
 'scope':['white demonstrator: both legs anatomical axial roll and foot frames','right foot hip support and outside closing path','paired opposite-leg adjustment during closing','original torso, arms and partner animation retained at shared source clock'],
 'pairedRetiming':retiming,
 'sampledRightLegSurfaces':{'fps':96,'samples':len(samples),'maximumPenetrationMeters':max(r['depth'] for r in rows),'maximumSupportErrorMeters':max(r.get('supportError') or 0 for r in rows),'maximumLockErrorMeters':max(r.get('lockError') or 0 for r in rows),'limitsMeters':{'penetration':.0025,'contact':.008},'scope':'interbody and self contacts involving the right leg; not a full-body clearance claim'},
 'anatomy':{'kneesChecked':knees['knees'],'samples':knees['times'],'failures':0,'minimumKneecapFacing':knees['minimumFacing'],'minimumAnkleFacing':knees['minimumAnkleFacing'],'minimumLockedRightKneeFlexionDegrees':min(r['kneeFlexionDegrees'] for r in locked),'lockedRightKneeMinimumDegrees':110,'lockedRightKneeTargetDegrees':120},
 'integrationTestsPassed':5,'exportParity':parity,'preservedPoses':preserved,'prefixAuditParity':prefix_parity,
 'closingContinuity':{'fps':24,'maximumTrackedLegJointStepMeters':maximum_step,'maximumAllowedMeters':.06},
 'closingClearancePatch':clearance,
 'runtimeContinuity':{'sampleFps':60,'maximumBoneStepLimitMeters':.06,'integrationTestPassed':True},
 'formReference':{'source':'https://github.com/Eelis/GrappleMap','revision':'032c8f91809786b7b784852abd07cf3e10c0ea35','sequence':679,'bottomRightKneeFlexionDegrees':119.7,'use':'pose-shape reference only; no captured motion or expert certification'},
 'remaining':['full triangle neck/shoulder contacts and hand grips','the other four techniques']}
shutil.copyfile(clip,ROOT/'assets/bjj/triangle-widget-poses.npz')
shutil.copyfile(asset,ROOT/'src/assets/bjj/triangle-study.glb')
(ROOT/'assets/bjj/triangle-widget-state.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf8')
print('LEG_REVISION_APPLIED',json.dumps(state['anatomy']),state['assetSha256'])
