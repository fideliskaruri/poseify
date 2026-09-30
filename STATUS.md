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
| M4 — Camera, lighting, environment | **PASS** | 71/71 tests; build clean. Browser-verified: FOV 15° vs 100° visibly changes perspective, light azimuth/elevation changes shading, cast shadow renders opposite the light, two-layer grid with adjustable cell/divisions |
| M5 — Export (5 passes + OBJ) | **PASS** | 106/106 tests; build clean. Browser-verified at 2048×2048: 5 passes produce 5 distinct payloads; OBJ export of the posed mannequin yields 86,640 verts / 28,880 faces in metres |
| M6 — Poses | **PASS** | 137/137 tests; build clean. Browser-verified: 98 pose tiles with 60 rendered thumbnails, search "sword" -> exactly 3, "lying" tag -> exactly 5. Pose transfer measured at 5.16e-8 rad max error between two differently-proportioned models |
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

## M4 notes

- `src/scene/SceneEnvironment.ts` owns camera FOV, the directional key light,
  a hemisphere fill, a two-layer ground grid, a shadow-only receiver plane, and
  the light-direction gizmo. `Viewport` delegates to it instead of building
  lights inline.
- **FOV** is clamped to 5-120 degrees and drives the projection matrix
  directly. Measured behaviour: a *narrow* FOV exaggerates the normalised
  separation between points at different depths, a wide one compresses them.
  (The first version of this test asserted the opposite; measuring it showed
  the premise was inverted, and the test now encodes the measured physics.)
- **Light direction** is spherical: azimuth 0 places the light on +Z rising
  clockwise, elevation is measured up from the horizon and clamped to >= 1
  degree so the direction vector stays defined. Distance is preserved at any
  angle, verified by test.
- **Light gizmo** sits at the light's own world position and is oriented with
  `lookAt(0,0,0)`, with the arrow modelled along -Z so it reads as pointing at
  the subject. A test asserts the gizmo position equals the light position and
  that its forward vector points at the origin.
- **Grid** is two `GridHelper` layers (fine at `cellSize`, coarse every 10
  cells) so distance is readable without a texture. Cell size and divisions are
  adjustable; the shadow receiver stays visible even when the grid is hidden so
  figures never appear to float.
- **Framing** (`frame`) fits a bounding box using the *current* FOV and aspect,
  so widening the lens does not crop the subject.

### Bug found and fixed during M4

1. **Light elevation was inverted.** The spherical conversion used `cos(el)`
   for Y, which put "90 degrees" (straight overhead) on the horizon. Corrected
   to the standard convention: Y uses `sin`, horizontal components use `cos`.
2. **Loaded FBX cast no shadows.** `castShadow`/`receiveShadow` are not set on
   imported assets, so the figure cast nothing onto the ground plane. Now set
   on every mesh as models load, which applies to all formats.

## M5 notes

- `src/export/OpenPose.ts` defines COCO-18 once, with the rig bone supplying
  each keypoint and the 17 limb connections. Face keypoints derive from the
  head bone using offsets scaled by head size.
- `src/export/RenderPasses.ts` provides the normal and depth override
  materials plus a real Sobel `CannyPass` (three has no built-in edge pass, so
  the scene renders to a luminance target and a 3×3 kernel runs as a
  fullscreen quad).
- `src/export/ObjExport.ts` bakes the pose by blending bone matrices per
  vertex, matching GPU skinning, so the OBJ carries the pose rather than the
  rest pose. Optional UVs and normals.
- `src/export/Exporter.ts` drives all five passes from one camera and one pose
  and restores renderer size, pixel ratio, clear alpha and background
  afterwards, so an export never leaves the viewport in a wrong state.

### OpenPose ordering is asserted literally

The test writes out all 18 keypoint names in order rather than comparing
against the same constant, because a reordering bug would otherwise pass every
test while silently producing a conditioning image that is useless in
ControlNet. Limb connections are checked against valid indices too.

### Bugs found by inspecting the exported images, not the code

Both were invisible to unit tests and only showed up when the actual PNGs were
looked at:

1. **OpenPose exported blank.** `drawOpenPose2D` called `getContext("2d")` on
   the renderer's canvas, which already holds a WebGL context. A canvas can
   only ever have one context type, so this returned `null` and nothing was
   drawn — silently, because the function was written defensively. The stick
   figure now paints on its own 2D canvas and is read back directly.
2. **Canny was byte-identical to Regular.** `CannyPass` drew its edge image,
   then `renderPass` re-rendered the scene on top of it. Only the passes that
   actually need a scene render do so now. A regression test asserts the
   drawing call count and that a transparent export paints no background.

### M5 verification detail

- All five passes exported at 2048×2048 from a posed mannequin (arm raised,
  torso twisted, one leg forward); payload sizes all differ, so no two passes
   are the same image.
- Visual check: regular is lit, OpenPose is a cyan COCO-18 stick figure, depth
  is a silhouette gradient, canny is edge lines only, normals is RGB
  view-space normals.
- OBJ export from the same live pose: 3.17 MB, 86,640 vertices, 28,880 faces,
  1-based indices, coordinates in metres — confirming the M3 scale
  normalization holds through export.

## M6 notes

- `src/pose/Pose.ts` defines the data model (`id`, `name`, `tags`, `bones`,
  `source`), tag filtering, search, validation against a model's available
  bones, and JSON round-tripping.
- `src/pose/PoseAuthoring.ts` converts authored Euler angles in degrees into
  quaternions, and provides mirroring and merging. Poses are authored in
  degrees because 98 poses written as raw quaternions would be unreviewable;
  degrees read like joint instructions.
- `src/pose/PoseLibrary.ts` ships 98 poses across all ten required categories.
  Five mirrored variants widen coverage and exercise the left/right swap that
  pose transfer depends on.
- `src/pose/PoseThumbnail.ts` renders thumbnails offscreen through the real
  `PosableSkeleton`, so a thumbnail always matches what applying the pose
  actually does. Generated lazily for visible tiles only, with in-flight
  de-duplication.

### Applying a pose to the wrong model reports why

`applyPose` validates against the target model's bones and reports the missing
ones instead of silently doing nothing, so applying a humanoid pose to a horse
explains itself rather than appearing broken.

### Bugs found and fixed during M6

1. **Pose thumbnails threw on construction.** The thumbnail rig is bone-only,
   but `PosableSkeleton` always set up CCD IK, which requires a SkinnedMesh.
   `PosableSkeleton` now accepts `enableIK: false` for FK-only rigs, and
   `solveIK` reports failure rather than throwing when disabled.
2. **`mirrorPose` produced negative zero.** `JSON.stringify` writes `-0` as
   `0`, so a serialise/parse round-trip failed deep equality on the five
   mirrored poses. Zero is now normalised on write.

### M6 verification detail

- Picker renders 98 tiles; 60 thumbnails generated on demand, all distinct
  and decoded.
- Search "sword" narrows 98 -> 3 (Sword Ready, Sword Overhead, Sword Thrust).
- Tag "lying" narrows to exactly 5 (Lie Supine, Lie Side, Lie Stomach, Lie
  Cradled, Sprawl).
- Pose transfer: `boxing_stance` applied to Mannequin Male, then to Muscular
  Male. Maximum per-bone quaternion angle error across all 11 bones was
  **5.16e-8 rad**, i.e. identical to float precision.

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
