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
> have the right to distribute.
>
> `npm install` runs `tools/setup-assets.ts`, which downloads these files on
> demand. They are gitignored, so a clone starts empty and fetches them itself.

All files below come from
`posemyart3.nyc3.cdn.digitaloceanspaces.com/models/` and are
PoseMy.Art — all rights reserved.

33 models are included, 67.16 MB total. Every row below is verified present in
`public/vendor/pose-my-art/manifest.json` and listed in
`src/models/VendorCatalog.ts`.

### Human (12)

| File | Display name | Size | Tags |
|---|---|---|---|
| `male_mannequin_OP_IK.fbx` | Mannequin Male | 1.79 MB | male, mannequin, neutral |
| `realistic_woman_OP_IK.fbx` | Realistic Woman | 7.88 MB | female, realistic, adult |
| `realistic_muscular_male_OP_IK.fbx` | Realistic Muscular Male | 4.73 MB | male, muscular, realistic, adult |
| `male_stocky_OP_IK.fbx` | Stocky Male | 2.11 MB | male, stocky, adult |
| `female_stocky_OP_IK.fbx` | Stocky Female | 1.32 MB | female, stocky, adult |
| `female_musculer_OP_IK.fbx` | Muscular Female | 1.32 MB | female, muscular, adult |
| `male_skinny_OP_IK.fbx` | Skinny Male | 1.70 MB | male, skinny, adult |
| `female_skinny_OP_IK.fbx` | Skinny Female | 1.40 MB | female, skinny, adult |
| `male_brute_OP_IK.fbx` | Brute Male | 4.45 MB | male, brute, big |
| `male_teen_fit_OP_IK.fbx` | Teen Fit Male | 2.09 MB | male, teen |
| `female_teen_fit_OP_IK.fbx` | Teen Fit Female | 4.44 MB | female, teen |
| `male_age_10_OP_IK.fbx` | Male Young Teen | 1.75 MB | male, child, young |

### Stylized (9)

| File | Display name | Size | Tags |
|---|---|---|---|
| `anime_female_OP_IK.fbx` | Anime Female | 0.93 MB | female, anime |
| `anime_basic_male_OP_IK.fbx` | Anime Basic Male | 0.93 MB | male, anime |
| `anime_basic_female_OP_IK.fbx` | Anime Basic Female | 0.93 MB | female, anime |
| `anime_big_breast_OP_IK.fbx` | Anime Curvy Female | 0.90 MB | female, anime |
| `anime_tall_busty_female_OP_IK.fbx` | Anime Tall Curvy Female | 0.93 MB | female, anime, tall |
| `anime_tall_male_OP_IK.fbx` | Anime Tall Male | 0.92 MB | male, anime, tall |
| `anime_child_girl_OP_IK.fbx` | Anime Child Girl | 4.53 MB | female, anime, child |
| `anime_child_boy_OP_IK.fbx` | Anime Child Boy | 0.92 MB | male, anime, child |
| `chibi_male_OP_IK.fbx` | Chibi Male | 1.14 MB | male, chibi, cute |

### Bot (6)

| File | Display name | Size | Tags |
|---|---|---|---|
| `new_Y_bot_OP_IK.fbx` | Bot Male | 2.56 MB | bot, male |
| `new_X_bot_OP_IK.fbx` | Bot Female | 2.27 MB | bot, female |
| `y_bot_fixed_OP_IK.fbx` | Bot Male (Fixed) | 2.60 MB | bot, male |
| `x_bot_fixed_OP_IK.fbx` | Bot Female (Fixed) | 2.32 MB | bot, female |
| `ybot_opt.fbx` | Mixamo Y Bot | 2.16 MB | bot |
| `xbot_opt.fbx` | Mixamo X Bot | 1.89 MB | bot |

### Skeleton (1)

| File | Display name | Size | Tags |
|---|---|---|---|
| `skeleton_OP_IK.fbx` | Skeleton | 1.14 MB | skeleton, rig |

### Creature (4)

| File | Display name | Size | Tags |
|---|---|---|---|
| `zombie_alien_OP_IK.fbx` | Zombie / Alien | 1.68 MB | zombie, alien, scifi |
| `werewolf_IK.fbx` | Werewolf | 1.21 MB | werewolf, fantasy |
| `female_mermaid_IK.fbx` | Female Mermaid | 0.80 MB | mermaid, fantasy, female |
| `male_mermaid_IK.fbx` | Male Mermaid | 0.77 MB | mermaid, fantasy, male |

### Animal (1)

| File | Display name | Size | Tags |
|---|---|---|---|
| `horse.fbx` | Horse | 0.66 MB | horse, quadruped |

Files are fetched by `tools/fetch-models.ts`, which probes every distinct
`.fbx` named in `research/model-catalog.csv` — 85 candidates in total — and
saves the ones the CDN actually serves. `tools/verify-models.ts` checks that
each one parses and maps onto the Poseify rig contract. Exact source URLs and
byte sizes are recorded in `public/vendor/pose-my-art/manifest.json`.

The remaining 52 candidates return a real HTTP 403: 44 `*_OP_Y_IK.fbx`
files, 7 `*_OP_Y.fbx` files (`Cat`, `Bear`, `Bull`, `Cow`, `Deer`,
`Bonnet_Macaque`, `Kangaroo`), and `wolf.fbx`. Availability is not
predictable from the filename — `wolf.fbx` 403s while `horse.fbx` serves fine.

## Rig convention

The skeleton contract in `src/rig/RigContract.ts` follows the Mixamo / Maya
humanoid naming convention (`Hips`, `Spine`, `LeftForeArm`, `LeftHandIndex1`,
...). That is a naming convention used across DCC packages, not a
copyrighted asset. The vendor FBX files use these names behind a namespace
(`mixamorigLeftForeArm`, `mixamorig1Hips`), and
`src/rig/Retargeter.ts` maps them onto the contract.

## Prop assets

The starter props in `src/props/` (chair, table, barrel, sword, ball) are
built from Three.js primitives in code that ships with Poseify, so they are
original works covered by the MIT license.

## Motion capture

130 normalized clips are derived from the
[CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/). CMU
states its motions are free to download and use. The ASF/AMC source files are
not redistributed — `tools/build-clips.ts` converts them to per-frame
quaternion JSON at install time under `public/vendor/mocap/`, which is also
gitignored.

## Draco / KTX2 decoders

At runtime, GLTF models may fetch Draco and KTX2 decoders from
`www.gstatic.com` and `cdn.jsdelivr.net` respectively. Those decoders are part
of the three.js project (MIT) and are not vendored into this repository. The
FBX models Poseify ships do not use either compression.
