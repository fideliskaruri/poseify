# Poseify: status

Last updated: 2026-10-02

Poseify is a free, MIT-licensed, browser-based 3D pose reference tool built
with Vue 3, Vite, TypeScript and three.js. This file records what exists, what
is known to be broken, and what is not yet verified. Earlier build logs are in
git history.

## What exists

| Area | State |
|---|---|
| Rig contract and three-tier retargeter | Built and covered by the test suite |
| Forward and inverse kinematics posing | Built |
| Pose library (1,298 own poses) and hand poses (9 per side) | Built |
| Pose tools: mirror, reset, copy/paste, joint groups, anchors | Built |
| CMU mocap import and clip playback | Built; clips are built locally with `npm run clips:build` |
| Procedural props, OBJ/glTF prop import, image planes | Built |
| Object transform and object operations | Built |
| Exports: Regular, OpenPose, Depth, Canny, Normals, OBJ | Built; see known bugs |
| Camera presets, scenes, save/load, undo/redo | Built |
| Shortcuts, settings, onboarding tour | Built |
| Bundled figure | **Missing.** A CC0 rigged humanoid is planned |

## Known bugs

Found in a code review on 2026-10-02 and not yet fixed:

1. **Render loop.** An exception inside a frame callback stops the loop, and
   `start()` does not guard against starting a second loop
   (`src/renderer/Viewport.ts`).
2. **OBJ export of skinned meshes is wrong.** Skin weights are read with the
   wrong stride, bone inverses are skipped, and the blend starts from the
   identity matrix. With normals on and UVs off the face format is wrong
   (`src/export/ObjExport.ts`).
3. **OpenPose hands use the wrong layout.** 16 points per hand, no wrist, thumb
   last, instead of the standard 21-point layout (`src/export/OpenPose.ts`).
4. **Clips play only their first quarter.** Duration is computed from the
   source frame rate after downsampling (`tools/build-clips.ts`,
   `src/anim/ClipPlayer.ts`).
5. **Mocap axes are probably wrong.** ASF per-bone axis frames are parsed but
   never applied (`src/anim/AsfAmc.ts`, `tools/build-clips.ts`).
6. **Anchor offsets are stored but ignored** (`src/posing/Anchors.ts`,
   `src/posing/PosableSkeleton.ts`).
7. **IK has no joint limits**, so elbows and knees can bend backwards.
8. **Async load races.** Quick model or scene switches can mix two loads
   (`src/composables/usePosing.ts`).
9. **Memory.** Removing models, props and scenes does not dispose geometry,
   materials or textures; some three.js objects sit in deep Vue refs; anchors
   allocate a new map every frame.
10. **UI.** The running-status label overlaps the top-left rail, and the
    onboarding tour may stay visible after Skip.

## Not yet verified

Browser behaviour has not been re-verified since the bugs above were found.
Treat earlier "verified" claims in git history as unconfirmed until they are
checked again with a headless browser and recorded with screenshots and
numbers.

## Licence clean-up

The documentation no longer describes Poseify as a copy of, or a host for,
another product's content. Some leftover files and code still need removing:
the install hook, the `Vendor*` loaders and catalogues, `research/raw/` and
`research/model-catalog.csv`. See `ATTRIBUTION.md`. Install with
`npm ci --ignore-scripts` until then.
