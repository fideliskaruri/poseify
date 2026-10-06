# Poseify

A free, MIT-licensed, browser-based 3D pose reference tool for artists.

Load a rigged humanoid, pose it with forward or inverse kinematics, stage it
with props, scrub through motion capture, and export reference images for use
as conditioning input. Everything runs in the browser: no account, no server
and no telemetry.

## Features

- **Two posing modes**: forward kinematics with a rotation gizmo on any joint,
  and inverse kinematics for dragging hands and feet.
- **Rig contract and retargeter**: any humanoid skeleton is mapped onto one
  shared contract, so poses and clips carry across figures.
- **Pose library**: poses authored in this repository (hand-made and generated),
  with search, tag filters and thumbnails.
- **Pose tools**: mirror arms or legs, reset one joint, switch sides, copy and
  paste poses between figures, joint groups and anchors.
- **Hand posing**: hand poses per side, applied separately from the body.
- **Motion capture**: clips converted from the CMU Graphics Lab Motion Capture
  Database, with play, pause, scrub and frame stepping.
- **Props and image planes**: a procedural prop set built in code, plus OBJ and
  glTF import, with floor and contact snapping.
- **Object transform**: move, rotate, scale, duplicate, hide, lock, recolour and
  delete whole figures and props.
- **Exports**: Regular, OpenPose (body, or body and hands), Depth, Canny and
  Normals as PNG up to 4096 px, a live depth preview, and OBJ for one figure or
  the whole scene.
- **Scenes and history**: camera presets, save and load to browser storage or
  JSON, undo and redo.
- **Keyboard shortcuts**: press `?` in the app for the full list.

## Getting started

Requires Node.js 20 or newer.

```bash
npm ci
npm run clips:build   # optional: downloads and converts the CMU mocap clips
npm run dev
```

Open the URL Vite prints, usually <http://localhost:5173>.

There is no install hook that downloads third-party model packs. The default
figure is the bundled CC0 humanoid under `public/models/`.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type check and production build |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type check only |
| `npm run clips:build` | Download and convert the CMU mocap clips |
| `npm run poses:generate` | Rebuild the generated pose library |
| `npm run scenes:generate` | Rebuild the generated scene library |
| `npm run demo:build` | Build the static demo page (also run by `build`) |

## How it works

Everything depends on the **rig contract** in `src/rig/RigContract.ts`: 22 body
bones plus 40 finger bones, using the Mixamo/Maya humanoid naming convention (a
naming convention, not an asset).

Because every figure, pose and clip is normalised onto that contract, a pose
authored on one figure applies to any other, and clips drive any rig without
re-authoring. `src/rig/Retargeter.ts` maps an arbitrary skeleton onto the
contract in three passes: exact name, alias, then a hierarchy and bone-length
heuristic. Bones it cannot match confidently are reported, not guessed.

## Project layout

```
src/
  rig/         Skeleton contract and the retargeter
  models/      Model catalogue, loaders, thumbnails
  posing/      Forward/inverse kinematics and the joint gizmo
  pose/        Pose data model, authoring helpers, pose library
  anim/        ASF/AMC parsing, clip format, playback
  props/       Prop system, procedural prop set, image planes
  scene/       Camera, light, grid, scenes, history
  export/      Render passes, OpenPose keypoints, OBJ export
  renderer/    WebGL viewport
public/
  models/      Bundled CC0 figure
tools/         Clip building, pose generation, demo page
```

## Known gaps

- Engine bugs and the work backlog are tracked in `STATUS.md`.

## Licence

MIT for the source code and the content authored in this repository. See
`ATTRIBUTION.md` for third-party software, data, and the bundled CC0 figure.
