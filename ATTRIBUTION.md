# Attribution

## Poseify

The Poseify source code is MIT licensed. So is the content authored in this
repository:

- the pose library in `src/pose/` (hand-made and generated poses)
- the hand-pose library in `src/pose/HandPoseLibrary.ts`
- the procedural prop set in `src/props/PropCatalog.ts`, built from three.js
  primitives in code
- the hand-authored premade scenes in `src/scene/PremadeScenes.ts`

## Third-party software

| Component | Licence | Use |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | MIT | Renderer, FBX/glTF/OBJ loaders, OrbitControls, TransformControls, CCDIKSolver |
| [Vue](https://github.com/vuejs/core) | MIT | Application shell |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tooling |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT | Test runner |

At runtime, glTF models may fetch Draco and KTX2 decoders from
`www.gstatic.com` and `cdn.jsdelivr.net`. They are part of the three.js project
(MIT) and are not vendored here.

## Motion capture

Clips are derived from the
[CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/), which
states its motions are free for all uses. The ASF/AMC source files are not
redistributed: `npm run clips:build` downloads and converts them locally into
`public/vendor/mocap/`, which is gitignored.

## Rig convention

The skeleton contract in `src/rig/RigContract.ts` uses the Mixamo/Maya humanoid
bone naming convention (`Hips`, `Spine`, `LeftForeArm`, `LeftHandIndex1`, ...).
That is a naming convention, not an asset.

## Files that are not part of Poseify

Some files left over from before this fork's licence clean-up are not covered by
the MIT licence and are not licensed for redistribution by this project:

- `research/raw/`
- `research/model-catalog.csv`
- `src/props/VendorPropCatalog.ts`
- anything an install hook or the `Vendor*` loaders download into
  `public/vendor/` (other than the mocap clips above)

They are scheduled for removal. Install with `npm ci --ignore-scripts` to skip
the download.
