# BJJ rebuild source assets

The current local widget's focused right-leg revision is preserved separately
in `triangle-widget-poses.npz`, with review scope and hashes in
`triangle-widget-state.json`. It corrects both white legs' anatomical roll and
foot frames, the right foot's hip support and its outside closing path. Opposite
leg joint positions participate in the closing correction. The locked right
knee must bend at least 110 degrees, with a 120-degree target; surface proximity
alone does not constitute a leg lock. This is not a claim that the entire triangle's
contacts or grips have passed review. See `docs/bjj-rebuild-progress.md` for the
current validation scope. The older `triangle-contact-poses.npz` remains an
independent, unfinished full-body experiment.

The rebuild uses MakeHuman's CC0 **graphical data**, not its application code.
Upstream revision: `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`.

| Local source | Upstream path |
| --- | --- |
| `source/base.obj` | `makehuman/data/3dobjs/base.obj` |
| `source/default.mhskel` | `makehuman/data/rigs/default.mhskel` |
| `source/default_weights.mhw` | `makehuman/data/rigs/default_weights.mhw` |
| `source/adult-male.target` | `makehuman/data/targets/macrodetails/caucasian-male-young.target` |

Repository: https://github.com/makehumancommunity/makehuman

Original asset license and license explanation are preserved beside the source
files. The weight and skeleton files also identify themselves as CC0. No
third-party clothing, skin texture, hair or animation pack is included.

`scripts/bjj-build-triangle.py` applies the adult male target, normalizes the
visible body to 1.78m, retains skin weights and the 163-bone hierarchy, assigns
simple training-suit materials, and creates an editable paired animation study.
Both people have identical geometry and scale. This is authored blocking motion,
not video reconstruction, mocap, dynamic cloth or a validated instructional asset.

Blender 4.5.0 portable is used as an external authoring tool, not distributed with
the website. The official ZIP SHA256 is
`2ee75e9466d293a784fdf020f60fe1309c1e0610ecf73c64f1fc09b01e5eec56`.

Build example (set the executable path to your local Blender installation):

```powershell
& $blender -b --factory-startup -P scripts/bjj-build-triangle.py
& $blender -b --factory-startup -P scripts/bjj-inspect-study.py
```

`BJJ_BLOCKING=1` produces three keyed blocking poses for faster static review.
Leave it unset for the complete authored clip. Do not publish the blocking export
as a completed animation. Outputs stay in `.astro/bjj-rebuild`; copying a reviewed
GLB to `src/assets/bjj/triangle-study.glb` is a separate explicit build step.

Reference video (comparison, not redistributed): Sideshow Jiu-Jitsu,
https://www.youtube.com/shorts/IrOqHj6CeXo . Existing reference observations remain
in `src/scripts/bjj-references.json`. No claim of measured 3D trajectories is made.

## Contact authoring snapshot

`triangle-contact-poses.npz` preserves the paired bone matrices of an authoring
candidate, independently of generated `.astro` files. Check the status and SHA256
in `triangle-contact-state.json` before using it. The current snapshot is work in
progress; it has not replaced the production GLB.

The offline correction uses the actual normalized four-weight surface, material
palm anchors, finger pads, floor contact, shin/neck contact, and ankle locking.
`BJJ_SWEPT_CONTACT=1` also constrains the incoming segment's midpoint, using the
endpoint differential of quaternion SLERP. This is sampled path correction, not
a formal continuous collision guarantee or an expert-certified demonstration.

To reproduce a review asset from the saved matrices (Blender Python needs NumPy
and SciPy):

```powershell
$env:BJJ_CONTACT_CLIP = (Resolve-Path assets/bjj/triangle-contact-poses.npz).Path
$env:BJJ_AUTHORING_OUT = '.astro/bjj-contact-review'
$env:BJJ_RENDER = '0'
& $blender -b -t 2 --factory-startup -P scripts/bjj-build-refined.py
$env:BJJ_FAST_AUTHOR = '1'
$env:BJJ_AUDIT_STEP = '0.020833333333333332'
& $blender -b -t 2 --factory-startup -P scripts/bjj-audit-contact.py
$env:BJJ_EXPORT_DIR = '.astro/bjj-contact-review'
node scripts/bjj-verify-export.mjs
```

The local widget leg revision uses a shared paired time map in
`src/scripts/bjj-triangle-timing.json`: source 13.5–16 seconds becomes display
13.5–19 seconds, retaining the full 22-second duration. `bjj-retime-glb.mjs`
changes animation timestamp accessors only. Its output must pass the matching
retimed authoring witness and mesh audit before `bjj-finalize-leg-revision.py`
copies it into the widget. Full triangle grips and the other techniques remain
unfinished; `triangle-widget-state.json` records the reviewed scope.

The export comparison includes times between baked frames. It compares actual
GLTFLoader/AnimationMixer skin points with the saved Blender witness, including
hands and metacarpals. `scripts/bjj-contact-path.test.py` checks the interpolation
and its noncommuting rotation differential against finite differences. The
fast authoring adapter has a separate actual-skin comparison with Blender.
