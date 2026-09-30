# Poseify — Build Status

Goal: free, open-source, browser-based 3D pose reference tool (PoseMy.Art equivalent).
Stack fixed: Vue 3 + Vite + TypeScript + Three.js. Zero paid cost.

Last updated: 2026-09-30

## Milestone state

| Milestone | State | Verification |
|---|---|---|
| M0 — Scaffold | **PASS** | `npm run dev` serves; WebGL canvas renders grid + orbit controls (confirmed in-browser); `npm run build` succeeds |
| M1 — Rig contract + retargeter | **PASS** | 23/23 vitest tests green + typecheck clean. Mixamo-named skeleton validates clean; scrambled skeleton fails with non-empty `missing`; three-tier retarget (exact / alias / heuristic) covered including fail-loudly |
| M2 — Model loading + posing core (FK/IK) | **PASS** | 46/46 tests; typecheck + build clean. Browser-verified: humanoid renders (2 draw calls, 1256 tris), joint select attaches TransformControls gizmo, FK rotation deforms mesh (hand moved 0.395 m), IK solves end-effector chain |
| M3 — Model library | **PASS** | 16 real FBX models downloaded and verified (16/16 resolve 22/22 core bones via alias, all skinned, correct heights). Browser-verified: mannequin renders at 28,880 tris and deforms under FK posing. 36 models total in picker |
| M4 — Camera, lighting, environment | TODO | — |
| M5 — Export (5 passes + OBJ) | TODO | — |
| M6 — Poses | TODO | — |
| M7 — Animations (CMU mocap) | TODO | — |
| M8 — Props + image planes | TODO | — |
| M9 — Scenes, save/load, undo | TODO | — |
| M10 — Polish + ship | TODO | — |

## M0 notes

- Vite 7.3.6, Vue 3.5, TypeScript 5.6, Three.js 0.169, Vitest 3.2.
- `@vue/tsconfig` was dropped: version 0.5.1 ships no `tsconfig.node.json`, which broke
  Vite's tsconfig resolution. Both tsconfigs are now standalone.
- `Viewport` class owns renderer/scene/camera/OrbitControls and is framework-free so
  later milestone systems attach without a Vue dependency.
- Three.js is code-split into its own chunk (`manualChunks`) to keep initial payload small
  ahead of M10.
- `preserveDrawingBuffer: true` is set for M5 screenshot exports.

## M1 notes

- `src/rig/RigContract.ts`: 20 body bones (exact names from FINDINGS.md §6),
  42 hand bones (generated from side x finger x 4 segments), 62-bone union,
  explicit `RIG_PARENTS` hierarchy map, `validateSkeleton` with
  `{ok, missing[], extra[]}`, `IK_CHAINS`, `isHandBone`.
- `src/rig/Retargeter.ts`: three-tier `retargetSkeleton` —
  1. exact contract-name match,
  2. alias/fuzzy match (namespace-stripped, side+part detection, implicit
     self-alias for all 62 contract names),
  3. parent-first hierarchy + bone-length heuristic with T-pose side
     convention (`leftIsPositiveX`, default true).
  Unresolved bones land in `missing`; `throwOnFailure` raises instead of
  returning a half-rigged model.
- Two real bugs were caught by the tests and fixed:
  - `normalise()` did not strip underscores, so `right_calf` never matched the
    `rightcalf` alias key. Now strips `_` and `:` too.
  - The alias tier was dead for namespaced exports because `mixamorig:Hips`
    reduced to bare `hips`, which had no alias entry. Added
    `CONTRACT_BY_NORMALISED` so every contract bone aliases its own normalised
    form.
- Test fixtures in `src/rig/__tests__/fixtures.ts` build a realistic
  ~1.7 m T-pose Mixamo-named `THREE.Bone` tree with `rename`/`omit`/`detach`/
  `lengths` options, so the retargeter is tested against loader-shaped input.

## M2 notes

- `src/models/ModelLoadConfig.ts`: per-model `boneSize` / `handBoneSize` /
  `hipBoneSize` tuning mirroring PoseMy, plus `gizmoSizeFor` resolution.
- `src/models/ModelLoader.ts`: GLTF/GLB/FBX/OBJ with runtime-configurable
  Draco + KTX2 decoder paths. FBX and OBJ loaders are dynamic imports so they
  cost nothing until a model of that format is requested.
- `src/models/ProceduralHumanoid.ts`: rigged mannequin built from the contract's
  own parent map, skinned by nearest bone. Six proportion presets (adult, child,
  brute, muscular, skinny, stocky) cover the realistic-human morph range.
- `src/models/ModelCatalog.ts`: 18 shipped models across human/stylized
  families, each with its own gizmo tuning.
- `src/posing/PosableSkeleton.ts`: FK posing with authored-rotation source of
  truth, `applyPose` / `getPose` for transfer, and per-chain CCD IK solvers.
- `src/posing/PoseController.ts`: click-to-select raycasting against joint
  positions, rotate-only TransformControls gizmo, FK/IK mode switch.

### Bugs found and fixed during M2

1. **Wrist bones missing from the required set.** `LeftHand`/`RightHand` lived
   only in the 42-bone hand group, so body-only validation never resolved them
   and the IK end effectors were missing. Added `CORE_BONES` = 20 body bones +
   both wrists, keeping `BODY_BONES` exactly as documented in FINDINGS.md.
2. **`getPose` / `resetPose` iterated a Record as if it were a Map.**
   `for...of this.rotations` and `this.rotations.keys()` both threw. Switched to
   `Object.entries` / `Object.keys`.
3. **One shared CCD solver dragged every limb.** `CCDIKSolver.update()` solves
   every chain it holds, so dragging the left hand also re-solved the right arm
   and both feet. Now one solver per chain, invoked only for the dragged
   effector.
4. **Skinned figure invisible in the browser.** `Skeleton.update()` threw
   because `boneMatrices` is sized at construction and IK target bones were
   appended afterwards. The exception aborted `projectObject` and dropped the
   whole figure from the render (1 draw call, 0 triangles). `setupIK` now
   reallocates `boneMatrices` and recomputes inverses after appending.
5. **Skeleton built before world matrices were resolved**, so every
   `boneInverse` was identity and skinning inflated the figure to 3.7 m. Now
   bone world matrices are updated before `new THREE.Skeleton(...)`.
6. **`OrbitControls.add()` does not exist** in three r169, so constructing
   `PoseController` threw during mount and left a blank canvas. Orbit is now
   disabled through the `dragging-changed` event instead.

### M2 verification detail

- FK: selecting `LeftArm` in the joint list attaches the rotate gizmo to the
  bone; rotating 1.2 rad about Z moves `LeftHand` 0.395 m and the mesh
  deforms with it.
- IK: dragging `RightHand` toward (-0.35, 1.55, 0.35) lands it at
  (-0.30, 1.50, 0.29) with the opposite arm untouched.
- Pose transfer between differently-proportioned models is covered by unit
  tests (adult <-> brute, adult <-> child) asserting quaternions match to 1e-6.

## M3 notes

- Models are now the **real PoseMy.Art FBX files**, fetched from
  `posemyart3.nyc3.cdn.digitaloceanspaces.com/models/` by
  `tools/fetch-models.ts` (31 MB, 16 files). The procedural mannequins remain
  in the catalogue as clearly-labelled offline fallbacks, prefixed
  `proc_*` so they never collide with the real ones.
- `tools/probe-models.ts` HEADs every candidate filename first.
  16 of 43 free files exist; the `_OP_Y_IK` variants all return HTTP 403.
- `tools/verify-models.ts` parses each FBX in Node and asserts the retargeter
  resolves every core bone. Current result: **16/16 clean**, all via the alias
  tier, all properly skinned, heights 1.3-1.8 m.

### Asset provenance — read before redistributing

The vendor FBX files are **PoseMy.Art's property. Not MIT, not CC0.** They are
gitignored and documented in `ATTRIBUTION.md`. Anyone forking or publishing this
repo must delete `public/vendor/pose-my-art/` or substitute clean assets.
Poseify's own procedural models are original and MIT.

### The retargeter earned its keep

These files use the Mixamo convention behind a Blender armature namespace:
`mixamorigRightUpLeg`, `mixamorig1Hips`. No existing alias matched, so every
model failed retargeting. Namespace stripping now handles the digit-suffixed
and bare forms, guarded by a lookahead so it cannot truncate names like
`ring1`.

### Bugs found and fixed during M3

1. **`FBXLoader.setDRACOLoader` does not exist** in three r169 — every FBX load
   threw. FBX stores geometry uncompressed; only GLTFLoader takes Draco.
2. **`FBXLoader.parse` rejects a Node Buffer.** It decodes via
   `new Uint8Array(buffer, from, to)`, which needs a real ArrayBuffer, so the
   binary magic check failed with "Unknown format".
3. **Type-only three import used at runtime** in `ModelCatalog.ts`
   (`import type * as THREE`), producing `THREE is not defined` at load.
4. **Scale normalisation collapsed the skinning.** These FBX are authored at
   ~176 units, so they need scaling to metres — but an FBX keeps its bones in a
   separate subtree from the mesh. Setting `scale` on the wrapper root moved
   the mesh while leaving the bone matrices unscaled, so skinning collapsed to
   a point and posing silently did nothing. Scaling each top-level node instead
   keeps mesh and skeleton consistent; the bind state is then recomputed.

## Legal posture

- Goal constraint #2 permits scraping `posemyart3.nyc3.cdn.digitaloceanspaces.com`.
- `research/FINDINGS.md` §9.6 says those FBX/pose/scene/thumbnail files are PoseMy's assets
  and must not be redistributed.
- **Decision:** build all core content procedurally or from CC0 sources so the licence-clean
  path is the default and no milestone depends on scraping. Any CDN use stays optional.

## Environment

- Node v26.5.1, npm 11.17.0, git 2.55.0
- Blender 5.2 installed at `C:\Program Files\Blender Foundation\Blender 5.2`
  (M3 asset generation path; procedural, no addon dependency)
