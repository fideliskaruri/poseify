# Attribution

Poseify is an independent, free, open-source reimplementation of the pose
reference workflow offered by PoseMy.Art. It is not affiliated with, endorsed
by, or connected to PoseMy.Art.

## Application source

The Poseify source code is MIT licensed.

| Component | License | Use |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | MIT | Renderer, FBX/GLTF/OBJ loaders, OrbitControls, TransformControls, CCDIKSolver |
| [Vue](https://github.com/vuejs/core) | MIT | Application shell |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tooling |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT | Test runner |

## 3D model assets — NOT MIT, NOT CC0

> **Read this before redistributing Poseify.**
>
> The FBX files under `public/vendor/pose-my-art/` are the property of
> PoseMy.Art. They are **not** covered by this project's MIT license and
> **not** released under CC0. They are included as locally-downloaded build
> inputs so the application has real, production-quality reference models.
>
> If you intend to publish, fork, or redistribute this repository, you must
> either remove `public/vendor/pose-my-art/` or replace it with assets you
> have the right to distribute. Poseify's own procedural models
> (`src/models/ProceduralHumanoid.ts`, `src/models/BotModels.ts`) are
> generated at runtime from code in this repository and carry no such
> restriction.

All files below come from
`posemyart3.nyc3.cdn.digitaloceanspaces.com/models/` and are
PoseMy.Art — all rights reserved.

| Asset | Family |
|---|---|
| `male_mannequin_OP_IK.fbx` | mannequin |
| `male_stocky_OP_IK.fbx`, `female_stocky_OP_IK.fbx` | stocky |
| `male_teen_fit_OP_IK.fbx`, `female_teen_fit_OP_IK.fbx` | teen |
| `anime_female_OP_IK.fbx`, `anime_basic_male_OP_IK.fbx`, `anime_basic_female_OP_IK.fbx` | anime |
| `chibi_male_OP_IK.fbx` | chibi |
| `zombie_alien_OP_IK.fbx` | creature |
| `new_Y_bot_OP_IK.fbx`, `y_bot_fixed_OP_IK.fbx`, `ybot_opt.fbx` | bot |
| `new_X_bot_OP_IK.fbx`, `x_bot_fixed_OP_IK.fbx`, `xbot_opt.fbx` | bot |

Files are fetched by `tools/fetch-models.ts`. `tools/verify-models.ts` checks
that each one parses and maps onto the Poseify rig contract. Exact source URLs
and byte sizes are recorded in `public/vendor/pose-my-art/manifest.json`.

The `*_OP_Y_IK.fbx` variants of these models were probed and return HTTP 403,
so they are not included.

## Rig convention

The skeleton contract in `src/rig/RigContract.ts` follows the Mixamo / Maya
humanoid naming convention (`Hips`, `Spine`, `LeftForeArm`, `LeftHandIndex1`,
...). That is a naming convention used across DCC packages, not a
copyrighted asset. The vendor FBX files use these names behind a namespace
(`mixamorigLeftForeArm`, `mixamorig1Hips`), and
`src/rig/Retargeter.ts` maps them onto the contract.

## Procedural assets

Everything under `src/models/ProceduralHumanoid.ts` and
`src/models/BotModels.ts` — the mannequin and the stick, blocky and
square-stick bots, plus all body proportion presets — is generated in code
that ships with Poseify. These are original works covered by the MIT license.

## Motion capture

No motion capture data has been bundled. Milestone M7 targets the
[CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/), whose
stated terms permit free download and use.

## Draco / KTX2 decoders

At runtime, GLTF models may fetch Draco and KTX2 decoders from
`www.gstatic.com` and `cdn.jsdelivr.net` respectively. Those decoders are part
of the three.js project (MIT) and are not vendored into this repository. The
FBX models Poseify ships do not use either compression.
