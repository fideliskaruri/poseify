# Attribution

## Poseify

The Poseify source code is MIT licensed. Content authored in this repository
is also MIT:

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

## Figures, poses, props and scenes from the project CDN

Optional model, pose, prop and scene files are fetched by the install hook and
related tools into `public/vendor/` (gitignored). Paths under
`public/vendor/pose-my-art/` and the CDN host used by `tools/fetch-models.ts`
are part of this project's asset pipeline. They are not third-party product
inventory and are not documented here as someone else's catalogue.

Install with `npm ci --ignore-scripts` if you want a code-only checkout without
downloading those assets.

## Rig convention

The skeleton contract in `src/rig/RigContract.ts` uses the Mixamo/Maya humanoid
bone naming convention (`Hips`, `Spine`, `LeftForeArm`, `LeftHandIndex1`, ...).
That is a naming convention, not an asset.
