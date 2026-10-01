# Poseify — Build Status

Goal: free, open-source, browser-based 3D pose reference tool (PoseMy.Art equivalent).
Stack fixed: Vue 3 + Vite + TypeScript + Three.js. Zero paid cost.

Last updated: 2026-10-01

## v2 gap-closing run — phase state

Evidence base: `research/GAP-ANALYSIS-2026-10-01.md`. Tracker:
`research/PARITY.md`. Objective: take Poseify from feature parity to
better-than, in nine phases.

**Licence decision, taken before any v2 code was written.** The working tree
held an uncommitted PoseMy.Art content scraper (`tools/scrape-poses.ts`,
`tools/scrape-assets.ts`, generated `src/pose/VendorPoseLibrary.ts`,
`src/props/VendorPropCatalog.ts`, `src/scene/VendorSceneLoader.ts`) that
deleted the authored `PoseLibrary.ts`, `PoseAuthoring.ts`, `PoseThumbnail.ts`
and `PremadeScenes.ts` and replaced them with 5,170 scraped vendor poses,
237 KB of scraped prop metadata and scraped scene indexes. That content is
behind PoseMy.Art's paywall and is not ours to ship, and HARD CONSTRAINT 3
forbids it. The work was preserved **reversibly** as
`stash@{0}: vendor-scrape-wip-preserved-2026-10-01` and the tree was restored
to `3de63fe`, the last committed MIT-clean state. Nothing was deleted.

| Phase | State | Verification |
|---|---|---|
| P0 — parity table | **PASS** | `research/PARITY.md` written; one row per GAP-ANALYSIS §2 capability across all nine subsections, each `Poseify (after)` cell a real value or explicit `TODO`, plus recorded scope decisions for animations, language and model count |
| P1 — object transform + object ops | **PARTIAL** | see below |
| P2 — pose surgery | **PARTIAL** | logic complete and tested; UI wired; browser check outstanding (see note) |
| P3–P8 | **TODO** | not started |

### Phase 1 detail

Built, in `src/scene/ObjectState.ts` (new, framework-free, Three-only) and
wired through `src/composables/usePosing.ts` and `src/App.vue`:

- **Per-object transform record.** `SceneModel`/`SceneProp` now carry a nested
  `transform {position, rotation, scale}` where models previously had a scalar
  `scale`, so a figure can be stretched non-uniformly. `parseScene` migrates
  the v1 flat shape, so scenes saved by the earlier build still open.
- **Object-level flags.** `state {hidden, locked, color}` travels with the
  object through save, load and duplicate.
- **Second gizmo.** `ObjectController` is a whole-object translate/rotate/
  scale `TransformControls`, deliberately separate from the existing
  bone-rotation gizmo in `PoseController` — their spaces are incompatible and
  conflating them breaks bone lengths. One drag is one undo entry.
- **Duplicate** (`Shift+D`) clones the model *and* its current pose onto a new
  `PosableSkeleton`, offset by the figure's own bounding width so a chibi and
  a brute do not separate by the same amount. A duplicate never inherits a
  lock.
- **Hide/Show** (`Shift+H`), **Lock** (`L`), **Colour** + Clear, **Delete**.
- **Shortcuts.** `G` move, `Shift+R` rotate, `S` scale, `Shift+D` duplicate,
  `Shift+H` hide, `L` lock. `R` stays reset-pose and `H` stays frame-scene, so
  the object equivalents take the modified key; modifier matching in
  `resolveShortcut` is exact, so no browser chord is swallowed.
- **Object toolbar** in the right panel mirroring PoseMy.Art's order, with an
  object picker listing models and props and labelling hidden/locked ones.

Two real bugs were found by verifying in a browser rather than by reading the
code, and both are fixed:

1. **Show/Lock labels did not update.** The flags live on `Object3D.userData`,
   which Vue cannot track, so the picker showed stale text. Fixed with an
   explicit `objectStateVersion` ref that computeds depend on.
2. **Two copies of one model collapsed into one.** `PosedModel` had no
   per-instance identity: the Scene list keyed on `config.id` (non-unique once
   a model is duplicated, so Vue reused one row) and `removeModel` filtered on
   `config.id` (so it removed both copies). Fixed by adding
   `PosedModel.instanceId` and keying/removing on it. This bug predates the v2
   run; Duplicate is simply what made it reachable.

| Check | Result |
|---|---|
| `npm test` | **287 passed / 287** (was 254 at `3de63fe`) |
| `npm run typecheck` | clean |
| `npm run build` | succeeds |
| Browser: object panel appears on model load | **PASS** |
| Browser: `S` -> Scale, `Shift+R` -> Rotate, `G` -> Move | **PASS** (real key events, segmented control state read back from the DOM) |
| Browser: `Shift+D` produces a second posed instance | **PASS** (two entries in Scene list and object picker) |
| Browser: Hide removes the figure from render | **PASS** (two figures in scene, one renders) |
| Browser: Lock label | **PASS** (`Mannequin Male (locked)`) |
| Browser: hidden + locked labels | **PASS** (`Mannequin Male (hidden, locked)`) |
| Test: two same-id models survive a scene round-trip | **PASS** |
| Test: transform + duplicate + hidden restore on re-apply | **PASS** |
| Test: double round-trip does not drift | **PASS** |
| Test: colour override restores true original after two overrides | **PASS** |
| Browser: save -> reload -> reopen restores 2 models incl. hidden | **UNVERIFIED** — see note |

**Note on the unverified row.** The save/reload/reopen round-trip was verified
only as far as: the saved scene persists across a reload and is listed under
**Saved**, and the serialisation layer is proven by tests
(`ObjectRoundTrip`, `ObjectSceneFlow`) covering two same-id models, the hidden
and locked flags, and double-round-trip stability. The final browser click
through to a two-model restore did not complete: this machine is running at
~78% CPU across ~28 unrelated `node` processes, and every CDP command to the
browser timed out (`Page.getFrameTree`, `Runtime.evaluate`,
"operation exceeded its deadline"). The same browser session earlier in the
run completed the same flows, so this is host contention rather than an app
fault. It should be re-run once the machine is quiet.

### Phase 2 detail

Pose surgery, so an artist can fix one limb or one joint without re-picking the
pose — the gap the all-or-nothing `mirrorPose` left.

Built in `src/pose/PoseAuthoring.ts` (extended), `src/pose/PoseClipboard.ts`
(new), `src/rig/RigContract.ts` (extended), wired through
`src/composables/usePosing.ts` and the Pose panel in `src/App.vue`:

- **Mirror Arm Limb / Mirror Leg Limb.** `mirrorLimb` selects bones by chain
  membership and reuses `swapSides`, factored out of the existing
  `mirrorPose`, rather than carrying a second bone-swap map.
- **Switch Pose Sides** (`X`). Exposes the existing whole-body `mirrorPose`,
  which was already implemented and tested but unreachable from the UI.
- **Reset Selected Joint** (`Alt+R`). Restores one bone to bind via the
  existing `resetBone`; every other bone is left untouched.
- **Copy Pose / Paste Pose.** `PoseClipboard` holds one pose with copy
  semantics and refuses an invalid pose rather than storing something that
  would fail later at apply time.
- **In Place** applies a pose without its `rootOffset`; **Random** picks from
  the current filter. Both re-apply through the last pose rather than needing
  a re-pick.

One real defect was found by writing the tests rather than by reading the
code: **`RIG_PARENTS` stopped at the wrist.** The 42 hand bones are in the
contract and the IK chains treat the wrist as an arm member, but any code
walking the hierarchy to find a limb could not see past `LeftHand` /
`RightHand`, so mirroring an arm silently dropped its 40 finger bones. The
finger chains now live in a new `HAND_PARENTS` map, merged via `FULL_PARENTS`.
They were deliberately **not** added to `RIG_PARENTS`, whose 22 entries are
quoted in `FINDINGS.md` and must not change.

| Check | Result |
|---|---|
| `npm test` | **315 passed / 315** (was 287) |
| `npm run typecheck` | clean |
| Test: mirroring arms leaves legs/spine/hips bit-identical | **PASS** |
| Test: mirroring legs leaves arms/spine/hips bit-identical | **PASS** |
| Test: `mirrorLimb` is its own inverse within 1e-6 | **PASS** |
| Test: limb walk reaches `Index1` and `Thumb4` | **PASS** |
| Test: `mirrorPose` twice returns to original within 1e-6 | **PASS** |
| Test: `mirrorPose` normalises -0 so round-trip is deep-equal | **PASS** |
| Test: clipboard transfer holds to 1e-6 | **PASS** |
| Test: clipboard refuses an invalid pose | **PASS** |
| Test: `X` = switch sides, `F` stays favourites | **PASS** |
| Test: `Alt+R` = reset joint, `R` stays reset pose | **PASS** |
| Test: `FULL_PARENTS` covers all 62 bones, `RIG_PARENTS` stays 22 | **PASS** |
| Browser: Surgery buttons present and act on a loaded model | **UNVERIFIED** — host at 92% CPU, CDP timing out |

Phase 2's correctness rests on quaternion-level assertions rather than
screenshots, which is what the objective asks for ("the other 21 bones
bit-identical (assert on quaternions, not screenshots)"). The browser row is
left explicitly unverified rather than claimed.

## Milestone state

| Milestone | State | Verification |
|---|---|---|
| M0 — Scaffold | **PASS** | `npm run dev` serves; WebGL canvas renders grid + orbit controls (confirmed in-browser); `npm run build` succeeds |
| M1 — Rig contract + retargeter | **PASS** | 23/23 vitest tests green + typecheck clean. Mixamo-named skeleton validates clean; scrambled skeleton fails with non-empty `missing`; three-tier retarget (exact / alias / heuristic) covered including fail-loudly |
| M2 — Model loading + posing core (FK/IK) | **PASS** | 46/46 tests; typecheck + build clean. Browser-verified: humanoid renders (2 draw calls, 1256 tris), joint select attaches TransformControls gizmo, FK rotation deforms mesh (hand moved 0.395 m), IK solves end-effector chain |
| M3 — Model library | **PASS** | All procedurally generated models removed. 85 CDN filenames probed, **33 reachable and downloaded** (67.16 MB), 52 confirmed HTTP 403, 0 unknown. `npm run models:verify`: 30 humanoids contract-clean, 3 non-humanoid by design, 0 failed. Browser-verified: 33 tiles each showing a real rendered PNG thumbnail of the actual FBX, 33 distinct data URLs, 0 procedural placeholders |
| M4 — Camera, lighting, environment | **PASS** | 71/71 tests; build clean. Browser-verified: FOV 15° vs 100° visibly changes perspective, light azimuth/elevation changes shading, cast shadow renders opposite the light, two-layer grid with adjustable cell/divisions |
| M5 — Export (5 passes + OBJ) | **PASS** | 106/106 tests; build clean. Browser-verified at 2048×2048: 5 passes produce 5 distinct payloads; OBJ export of the posed mannequin yields 86,640 verts / 28,880 faces in metres |
| M6 — Poses | **PASS** | 137/137 tests; build clean. Browser-verified: 98 pose tiles with 60 rendered thumbnails, search "sword" -> exactly 3, "lying" tag -> exactly 5. Pose transfer measured at 5.16e-8 rad max error between two differently-proportioned models |
| M7 — Animations (CMU mocap) | **PASS** | 130 clips imported from CMU, 179/179 tests, build clean. Browser-verified: clips listed, transport loads, scrubbing to 0.60s moves LeftHand 21 cm and changes the Spine quaternion |
| M8 — Props + image planes | **PASS** | 202/202 tests; build clean. Browser-verified: chair renders at real-world scale and the seated pose places the figure on it (footY 0.454 vs a 0.45 m seat) |
| M9 — Scenes, save/load, undo | **PASS** | 239/239 tests; build clean. Browser-verified: premade scene loads with figure + props, save → page reload → restore is identical, undo/redo walks state correctly |
| M10 — Polish + ship | **PASS** | 254/254 tests; typecheck + build clean. Browser-verified: favourites persist across reload (3 lit hearts survive, filter narrows 33 → 3), settings panel opens with 9 shortcuts, `?`/`F`/`Delete`/`Ctrl+,` all fire, `Ctrl+H` correctly does nothing, onboarding tour renders and advances, console has 0 errors. Fresh clone -> `npm install` -> 33/33 models -> `npm run build` succeeds |

## Model availability — settled

The CDN catalogue is now fully characterised, so nothing further is being
probed. `research/model-catalog.csv` names 85 distinct `.fbx` files; of those:

| Outcome | Count | Detail |
|---|---|---|
| Downloaded | 33 | 67.16 MB, all listed in `src/models/VendorCatalog.ts` |
| HTTP 403 | 52 | 44 `*_OP_Y_IK.fbx`, 7 `*_OP_Y.fbx`, `wolf.fbx` |
| Unknown | 0 | no throttled requests left unresolved |

Every one of the 33 downloaded files is present in the CSV, and every CSV file
not downloaded is a confirmed 403 — the two sets agree exactly, with nothing
unaccounted for. `npm run models:verify` re-checks all 33 against the rig
contract: 30 humanoids clean, 3 non-humanoid by design (2 mermaids, horse),
0 failures.

The `*_OP_Y*` families are the second rig generation. They are gone from the
CDN entirely, not merely premium-gated — `wolf.fbx` 403s while `horse.fbx`
serves, so availability does not follow the filename or the premium flag.

```
probed 85 distinct fbx
  downloaded 33  67.16 MB
  missing    52  (definite HTTP 403/404)
  unknown    0  (no usable HTTP status -- NOT missing)
```

### Fetch robustness

`tools/fetch-models.ts` distinguishes a *throttled* request from a *missing*
file and never records one as the other. Because the CDN rate-limits hard, two
guards were added after a real fresh-clone failure delivered only 29 of 33:

- a retry sweep that re-queues every `unknown` at the cold gap, up to 3 sweeps;
- `REQUEST_TIMEOUT_MS` raised 30s -> 120s, because the largest model
  (`realistic_woman_OP_IK.fbx`, 7.88 MB) was timing out rather than failing.

`tools/setup-assets.ts` now checks that every FBX referenced by
`VendorCatalog.ts` exists, not merely that the directory does, and warns with
the missing filenames if a fetch comes up short.

## Research dossier status

`research/FINDINGS.md` is the original pre-build dossier and is retained for
provenance. Two of its recommendations were deliberately overridden and are now
marked superseded in place:

- its MPFB/MakeHuman asset route (7.1) — the shipped library is scraped vendor
  FBX, per the goal prompt's explicit authorisation of the CDN and the user's
  rejection of hand-built mannequins;
- its "do not scrape `posemyart3.nyc3.cdn.digitaloceanspaces.com`" line (9.6) —
  void for this project.

The rig convention, mocap source and scale factor, and OpenPose keypoint
ordering in that document remain accurate and load-bearing.

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
- `src/models/VendorCatalog.ts`: 33 models scraped from the PoseMy.Art CDN,
  across human/stylized/bot/skeleton/creature/animal families, each with its
  own gizmo tuning. All procedurally generated models have been removed.
- `src/models/ModelCatalog.ts`: the shipped catalogue. Vendor FBX only — there
  is no procedural fallback any more.
- `src/models/ModelThumbnail.ts`: renders a real thumbnail per model by
  loading the FBX, framing its bounds and capturing a 128px PNG. Cached per id
  with in-flight de-duplication.
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

## M7 notes

- Source: CMU Graphics Lab Motion Capture Database, whose stated terms are
  "free for all uses". 130 clips across 13 subjects, 31,363 frames, 261 s of
  motion after downsampling.
- `src/anim/AsfAmc.ts` parses **ASF 1.10**, which is what CMU actually serves,
  not the classic `:OFFSETS` layout: `:bonedata` carries per-bone
  direction/length/axis and `:hierarchy` carries parentage. The AMC is the
  `:FULLY-SPECIFIED` variant, where each frame is a bare integer followed by
  named bone lines and the root line carries translation before rotation.
- `mapCmuBoneToContract` maps CMU names (`lhipjoint`, `lfemur`, `lowerback`) onto
  contract bones, returning null rather than guessing. 24 of 30 CMU bones map;
  the 6 that do not are fingers, thumbs and wrists, which have no
  contract equivalent at this granularity.
- Clips ship as a **52 KB manifest plus one file per clip** (~200 KB each),
  fetched on demand. A single-file build was tried first and reached 477 MB.
- Output is downsampled from CMU's 120 fps to 30 fps and capped at 12 s per
  clip: 477 MB -> 21.6 MB total, with nothing downloaded until a clip plays.
- `ClipPlayer` drives playback from the render loop's clock (clamped, so a
  backgrounded tab does not jump forward) and supports play/pause, scrub, frame
  step and loop. Scrubbing freezes the frame as a static pose.

### Bugs found by testing against real downloaded data

All three were caught by parsing real CMU files rather than a hand-written
fixture that could have drifted from the actual format:

1. **Rotations indexed by bone instead of channel.** The AMC parser wrote to
   `rotations[idx]` where `idx` is a bone index, but each bone owns three
   consecutive channels. Every bone past the first read another bone's values,
   scrambling every clip's pose. This would have been completely invisible
   without real-data assertions on channel count and per-bone change.
2. **Build script skipped every subject.** The parsed skeleton was assigned to
   the map but not to the local variable, so `if (!skeleton) continue` fired on
   first visit and the run produced an empty library.
3. **Quantisation broke unit length.** Rounding each quaternion component
   independently lands ~0.5% off the unit sphere; across tens of thousands of
   frames that error accumulates. Quaternions are now renormalised after
   rounding.

### M7 verification detail

- 40 clips listed in the picker; selecting one loads the transport
  ("frame 0 - 0.00s / 1.25s").
- Scrubbing to 0.60 s: Spine quaternion changed from
  `(-0.0364, 0.0084, -0.0142, 0.9992)` to `(-0.0486, 0.0245, 0.0628, 0.9965)`
  and `LeftHand` world position moved from `(-0.288, 1.88, -0.084)` to
  `(-0.435, 1.822, -0.153)` — 21 cm of motion, confirming the mocap genuinely
  drives the skinned mesh rather than only moving empty bones.

## M8 notes

- `src/props/PropSystem.ts` handles OBJ/GLB import, transform, and snapping:
  floor snap works by **bounds**, not by geometry origin, because imported
  meshes rarely have their origin at their base.
- `src/props/PropCatalog.ts` builds the starter set in code — chair, table,
  barrel, sword, ball, crate, cylinder, cone, plane — so the shipped props are
  original MIT work with no licence questions. Sizes are real-world metres
  (0.45 m seat, 0.75 m table).
- `src/props/ImagePlane.ts` imports an image as a real quad for composition
  and perspective checks, preserving aspect ratio by default.

### Three pose defects found by measuring, not eyeballing

All three were invisible to tests and would have shipped:

1. **Rotations replaced bind orientation instead of composing on top of it.**
    Two models sharing the rig contract can have different rest orientations,
    so the same pose landed differently on each — exactly what pose transfer
    must not do. `setBoneRotation` now multiplies the bind quaternion, and
    `getBoneQuaternion` reports the authored value rather than the composed one.
    Covered by a test giving two rigs different binds.
2. **The rig has no pelvis bone, and `Hips` is the skeleton root**, so rotating
    it spins the figure rather than lowering it. Seated and kneeling poses
    floated above the chair with their legs behind it. Poses now carry an
    optional `rootOffset`, folded back into the bind offset so repeated
    applications do not accumulate.
3. **Seated leg angles rested on two wrong assumptions.** Measured on the
    contract rest pose: a positive `UpLeg` X rotation swings the thigh
    **backward**, so a seated pose needs a negative one; and with the thigh
    forward, the knee must fold the shin **down**, which is the opposite sign
    again. Both are derived from measurement and documented in the library.

### Prop size errors caught by tests

- The declared sword depth was 0.05 m against a real 0.09 m (the pommel sphere
  set the depth, not the blade).
- Crate battens sat proud of the crate, making it 0.50 m deep against a
  declared 0.45 m; they are now inset flush.
- `ball`, `plane`, `cylinder` and `cone` returned bare Meshes rather than
  Groups, so nothing could be parented to them.

### M8 verification detail

- Adding a chair and applying `seated_relaxed` places the figure on the seat
  with both feet on the floor: `footY` 0.454 m against a 0.45 m seat height.

## M9 notes

- `src/scene/Scene.ts` defines scene state as plain data with no three.js
  objects, so it serialises, round trips, and can live in localStorage or a
  file. Quaternions are stored rather than Euler angles so a reloaded scene
  reproduces the pose exactly. `parseScene` repairs malformed fields rather
  than throwing, because scene files are hand-editable and arrive from
  downloads.
- `src/scene/History.ts` implements undo/redo as a stack of scene snapshots
  rather than inverse operations, which avoids the classic failure where an
  inverse does not exactly restore the prior state and history drifts. Snapshots
  are cloned in and out so later mutation cannot retroactively alter history.
- `src/scene/PremadeScenes.ts` ships **48** premade scenes, above the ~30
  asked for, spanning standing, seated, walking, running, fighting, aiming,
  kneeling, lying, gesturing, dancing and staging. Tests assert every scene
  references only models, poses and props that actually exist.
- `src/scene/SceneStorage.ts` handles localStorage plus JSON file import and
  export, guarding against storage being unavailable (private browsing) or
  full (quota).

### Bug found and fixed during M9

**`applyScene` referenced `findModel` without importing it**, after the M3
catalogue rewrite renamed exports. Every scene silently loaded empty. What made
this nasty is that the `catch` reported the model as "missing" rather than
surfacing the error, so the scene just appeared to have nothing in it. The
catch now includes the underlying message.

### M9 verification detail

- "Cafe Corner" loads a seated figure with chair, table and barrel
  (22 bones, 3 props, 54k triangles).
- Save writes `poseify.scene.<name>` and an index to localStorage; reloading
  the page restores the scene identically — same bones, props, pose, layout
  and name.
- Adding a crate, then undoing, removes it and disables Undo; redo brings it
  back.

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
