# Attribution

## Poseify

The Poseify source code is MIT licensed. Content authored in this repository is
also MIT unless a file says otherwise:

- the pose library in `src/pose/` (hand-made and generated poses)
- the hand-pose library in `src/pose/HandPoseLibrary.ts`
- the procedural prop set in `src/props/PropCatalog.ts`, built from three.js
  primitives in code
- the hand-authored premade scenes in `src/scene/PremadeScenes.ts`

Poseify does not ship PoseMy.Art models, poses, scenes, or props.

## Bundled figure

| Asset | Licence | Notes |
|---|---|---|
| `public/models/cc0-humanoid.glb` | CC0 1.0 (original to this project) | Default rigged humanoid for the model picker. See `public/models/cc0-humanoid.LICENSE.txt`. |

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
