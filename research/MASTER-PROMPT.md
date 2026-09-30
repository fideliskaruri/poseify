# MASTER PROMPT — Build Poseify (overnight goal run)

> Paste this into a fresh Codex chat, set as a goal, and let it run.

---

## ROLE

You are building **Poseify** — a free, open-source, browser-based 3D pose reference tool for artists, functionally equivalent to PoseMy.Art. Work autonomously through the entire milestone list without asking for confirmation on routine decisions. Stop only when a milestone's verification check actually passes, or when you hit a genuine blocker you cannot solve.

## HARD CONSTRAINTS

1. **Zero cost.** No paid APIs, no paid assets, no paid services, no cloud accounts requiring a credit card. Free tiers of anything are acceptable.
2. **Only ship assets you can legally redistribute.** Permitted: CC0, MIT, Apache-2.0, public domain. Banned: PoseMy.Art's FBX models, pose data, scene data, prop meshes, and thumbnails; Mixamo FBX/GLB character files; anything with a non-commercial or no-redistribution clause. **Do not scrape `posemyart3.nyc3.cdn.digitaloceanspaces.com`.**
3. **Stack is fixed** (matches the original, all MIT): Vue 3 + Vite + TypeScript, Three.js for 3D, plain CSS or Tailwind for UI. Do not introduce a heavy UI framework unless it's already installed.
4. **Work in** `C:\Users\Tyroon\Desktop\projects-backup\posify`.
5. Read `research/FINDINGS.md` first — it contains the reverse-engineered spec, the 85-model catalog, and the exact skeleton contract. Read `research/model-catalog.csv` for the target feature parity list.

## NON-NEGOTIABLE ARCHITECTURAL DECISION

Everything hinges on one **rig contract**. Define it in `src/rig/RigContract.ts` and never deviate:

- 20 body bones, exact names: `Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, RightShoulder, RightArm, RightForeArm, RightHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, RightUpLeg, RightLeg, RightFoot, RightToeBase`
- 42 hand bones: `{Left,Right}Hand` plus `{Left,Right}Hand{Index,Middle,Ring,Pinky,Thumb}{1,2,3,4}`
- Hip bone: `Hips`

This is the Mixamo/Maya humanoid convention. **Build the retargeting pipeline before building any UI.** A model that does not match these names is unusable, and a pose that does not port across models is the single biggest failure mode in this product.

## MILESTONES

Work in order. Each has a verification check — do not advance until it passes.

### M0 — Scaffold
- Vite + Vue 3 + TS project, Three.js, working dev server.
- Verify: `npm run dev` serves and renders an empty Three.js scene with a grid + orbit controls.

### M1 — Rig contract + retargeter
- `RigContract.ts` with the bone lists above and a `validateSkeleton(boneNames)` returning `{ok, missing[], extra[]}`.
- Retargeter: given a `THREE.Bone` tree with arbitrary bone names, produce a normalized skeleton by name match, then by heuristic (bone length + hierarchy position), then fail loudly.
- Verify: unit test asserting a known Mixamo-named skeleton validates clean, and a scrambled skeleton fails with a non-empty `missing` list.

### M2 — Model loading + posing core (THE critical milestone)
- `FBXLoader` + `GLTFLoader` + `OBJLoader`, lazy-loaded, Draco/KTX2 support.
- Per-model load config mirroring PoseMy: `boneSize`, `handBoneSize`, `hipBoneSize`.
- Click-to-select bone, `TransformControls` gizmo per joint, rotate-only by default.
- **Two interaction modes, exactly like PoseMy:**
  - **FK (forward kinematics)** — rotate a single joint; children follow.
  - **IK (inverse kinematics)** — drag an end effector (hand/foot); the chain solves. Three.js `CCDIKSolver` is the proven baseline; polish if needed.
- Per-model gizmo sizing so chibi and brute both feel controllable.
- Verify: load 2 models of different proportions, pose one, transfer the pose to the other, and it holds without breaking.

### M3 — Model library (all CC0)
- Generate base meshes with **MPFB** (MakeHuman for Blender 4.x) offline, export GLB/FBX, retarget to the rig contract. Cover the realistic-human morph range (male/female, teen/child/adult, brute/skinny/stocky/muscular).
- Build `stick_bot`, `blocky_bot`, `square_stick_bot`, and a simplified skeleton **procedurally in Three.js** from primitives — cheaper and cleaner than sourcing FBX.
- Grid-based model picker UI with thumbnails.
- Verify: every shipped model passes `validateSkeleton`; at least 10 humanoids ship by end of run.

### M4 — Camera, lighting, environment
- Orbit + pan + zoom, plus **FOV control** (PoseMy advertises "dramatic perspective" via FOV).
- Directional light with azimuth/elevation/intensity controls, and a visible light-direction gizmo.
- Infinite grid ground plane with adjustable subdivisions.
- Verify: FOV slider visibly changes perspective distortion; light direction gizmo matches rendered shadows.

### M5 — Export
Five render passes from one scene:

1. **Regular** (beauty pass, current materials)
2. **OpenPose** — skeletal 2D keypoints, correct COCO-18 ordering + face/foot extras
3. **Depth** — normalized depth buffer visualization
4. **Canny** — edge detection
5. **Normals** — view-space normal buffer

Plus **OBJ scene export** of the posed figure, and transparent-background support for all image exports.
- Verify: export all 5 at 2048x2048 and visually confirm each is correct; confirm OBJ re-imports into Blender with the pose intact.

### M6 — Poses
- Pose data model: `{name, tags[], boneRotations{}, source}`.
- Pose picker UI with thumbnail grid + tag filter + search.
- One-click pose apply; **pose transfer across models** (same bone contract makes this a straight quat copy).
- Author a starter library of ~100 poses by hand across common categories: standing, sitting, walking, running, fighting, aiming, kneeling, lying, dancing, gestures.
- Verify: apply a pose to model A, switch to model B, re-apply, pose holds identically.

### M7 — Animations
- Build-time script: CMU ASF/AMC -> normalized clips. CMU states its motions are free to download and use (http://mocap.cs.cmu.edu/, verified). Convert with scale factor `0.056444` to meters.
- Store as compact JSON (per-frame quaternion keyframes), not raw ASF/AMC.
- Playback: play/pause, scrub, frame step, loop. **Pose freezes a frame on scrub** — this is the core value prop ("find natural poses on every frame").
- Verify: at least 50 clips import and play; scrubbing to a frame and applying it as a static pose works.

### M8 — Props + image planes
- Prop system: load OBJ/GLB props, transform/rotate/scale, snap to floor and to model contact points.
- Image plane: import any image as a controllable 3D plane for composition/perspective checking.
- Author a small CC0 prop starter set procedurally (primitives: box, cylinder, sphere, cone, plane) — a chair, table, barrel, sword, ball.
- Verify: place a prop, pose the model interacting with it, export.

### M9 — Scenes, save/load, undo
- **Premade scenes**: named bundles of {models, poses, props, camera, light}. Author ~30.
- Save/load to `localStorage` + JSON file import/export. No server, no account.
- Undo/redo stack with `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`.
- Verify: save a scene, reload the page, restore it identically; undo/redo walks state correctly.

### M10 — Polish + ship
- Favorites (heart), settings panel, keyboard shortcuts, onboarding tooltip tour.
- Lazy-load everything; keep the initial payload small.
- `README.md` with setup, asset provenance table, and license attributions. **`ATTRIBUTION.md` is mandatory.**
- Verify: fresh clone -> `npm install && npm run dev` -> working app. `npm run build` succeeds.

## WORKING STYLE

- Test-driven on the rig contract, retargeter, pose transfer, and OpenPose export — these are correctness-critical. Other UI work can be lighter.
- Prefer reimplementing a feature over sourcing a questionable asset. A procedurally generated mannequin beats a license-encumbered download.
- If a milestone stalls, note it in `STATUS.md`, move to the next unblocked milestone, and keep going.
- Maintain `STATUS.md` as you go: milestone state, what passes, what's blocked, what's left.
- Verify claims before making them. "Done" means the verification check ran and passed.

## SUCCESS CRITERION

Someone opens Poseify, picks a CC0 mannequin, poses it with IK, drops in a prop, applies or scrubs an animation frame, adjusts camera FOV and light direction, and exports Regular + OpenPose + Depth + Canny + Normals images plus an OBJ of the posed figure — entirely free, entirely in the browser, entirely redistributable.

If all 11 milestones pass, the rebuild is functionally complete.
