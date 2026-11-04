# BJJ rebuild source assets

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
