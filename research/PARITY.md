---
date: 2026-10-01
source: GAP-ANALYSIS-2026-10-01.md
updated: 2026-10-01
---

# Parity tracker

One row per capability measured in `GAP-ANALYSIS-2026-10-01.md` §2. This is
the run's honesty mechanism: a phase is not done because the code compiles, it
is done when its `verified how` check actually ran.

`Poseify (before)` is the state at commit `3de63fe` (all 11 milestones of the
v1 build, 254 tests green). `Poseify (after)` is updated as phases land.

Legend for the last column: `test` = asserted in `npm test`,
`browser` = verified by hand in a running dev server,
`pending` = not yet built.

## 2.1 Transform and manipulation

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Move whole model (`g`) | yes | no | yes (`G`) | 1 | browser |
| Rotate whole model (`r`) | yes | no | yes (`Shift+R`) | 1 | browser |
| Scale model (`s`) | yes | no (scalar scale in scene file only) | yes, non-uniform (`S`) | 1 | browser + test |
| Duplicate model in scene (`Shift+D`) | yes | no | yes, pose copied | 1 | browser + test |
| Recolor model / prop | yes | no | yes, clear restores original | 1 | test (swatch wired; click not exercised) |
| Hide/show object (`h`) | yes | no | yes (`Shift+H`) | 1 | browser |
| Lock object against edits | yes | no | yes (`L`), gizmo refuses attach | 1 | browser + test |
| Delete object | yes | yes | yes | - | existing |

## 2.2 Pose editing and transfer

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Copy Pose | yes | no | yes, session clipboard | 2 | test |
| Paste Pose | yes | no | yes, holds to 1e-6 | 2 | test |
| Copy Pose (And Hand Pose) | yes | no | TODO | 5 | test |
| Paste Pose - Hand Only | yes | no | TODO | 5 | test |
| Load Pose from File - Hand Only | yes | no | TODO | 5 | browser |
| Mirror Arm Limb | yes | no (whole-body only) | yes, incl. 40 finger bones | 2 | test |
| Mirror Leg Limb | yes | no (whole-body only) | yes | 2 | test |
| Switch Pose Sides (`f`/`x`) | yes | function exists, no UI | yes (`X`) | 2 | test |
| Reset Selected Joint | yes | whole-pose reset only | yes (`Alt+R`) | 2 | test |
| Random pose button | yes | no | yes | 2 | test |
| In Place toggle (no rootOffset) | yes | implicit via `rootOffset`, no UI | yes | 2 | test |
| Pose search | yes | yes | yes | - | existing |
| Category dropdown | yes (563) | no (10 flat tag chips) | TODO | 2 | browser |
| Rows-per-page control | yes | no (fixed grid) | TODO | 2 | browser |
| Pose-level save/load | yes | scene-level only | TODO | 2 | browser |

## 2.3 Hand posing

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Hand pose library | yes | none | TODO | 5 | test |
| Hand pose as separate payload | yes | none | TODO | 5 | test |
| Hand Poses toolbar button | yes | none | TODO | 5 | browser |
| Hand-pose authoring format | yes | none | TODO | 5 | test |
| Hand pose applies / no-ops with a reason | yes | n/a | TODO | 5 | test |

## 2.4 Skeleton organisation

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Named joint list (22 bones) | implicit | yes | yes | - | existing advantage |
| Joint groups | yes | no | TODO | 6 | test |
| Add New Group (user-defined) | yes | no | TODO | 6 | browser |
| Rotate-group / reset-group | yes | no | TODO | 6 | browser |
| Anchors (pin joint to joint or prop) | yes | no | TODO | 6 | test |
| Cycle rejection on anchor creation | yes | n/a | TODO | 6 | test |

## 2.5 Camera

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| FOV | yes | yes | yes | - | existing |
| Lock / unlock camera | yes | no | TODO | 4a | browser |
| Reset camera | yes | no | TODO | 4a | browser |
| Named camera presets | yes | no | TODO | 4a | test |
| Take Screenshot (viewport capture) | yes | no | TODO | 4a | browser |
| Frame scene | implied | yes | yes | - | existing |

## 2.6 Export

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Regular image | yes | yes | yes | - | existing |
| OpenPose without hands | yes | no | yes, COCO-18 indices unchanged | 3 | test + browser |
| OpenPose with hands | yes | one undifferentiated export | yes, 32 finger keypoints | 3 | test + browser |
| Depth | yes | yes | yes | - | existing |
| Canny | yes | yes | yes | - | existing |
| Normals | yes | yes | yes | - | existing |
| Preview Depth (live toggle) | yes | no | yes, restores exact prior state | 3 | test + browser |
| Width / Height fields | yes (3 separate) | single resolution slider | yes | 3 | browser |
| Transparent background | no | yes | yes | - | existing advantage |
| Export whole scene to OBJ | yes | figure only | yes, models + props, index-offset | 3 | test (download bytes unreadable in-browser) |

## 2.7 Settings

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Floor grid on/off | yes | yes | yes | - | existing |
| Adjustable grid (cell + divisions) | no | yes | yes | - | existing advantage |
| Ground | yes | no | TODO | 8 | browser |
| Shadows | yes | yes | yes | - | existing |
| Outline | yes | no | TODO | 8 | browser |
| Inverse Kinematics setting | yes | mode button | yes | - | existing |
| Language | yes | no | out of scope (MIT-clean, single-locale) | - | n/a |

## 2.8 Library depth

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Poses | 2446 free / 6300+ claimed | 98 | TODO 1000+ | 7 | test + browser |
| Premade scenes | 28 pages / 5500+ claimed | 48 | TODO 200+ | 7 | test |
| Animations | 32 pages / 2400+ claimed | 130 clips | out of scope for v2 | - | n/a |
| Props | 26 pages | 9 | TODO (characterful) | 7 | test |
| Models | 54 | 33 (vendor FBX, gitignored) | TODO licence-clean path | 4b | browser |
| Category taxonomy | 563 | 10 tags | TODO (generated tags) | 7 | browser |
| Hand poses | dedicated library | none | TODO (9 authored) | 5 | test |

## 2.9 Platform

| capability | PoseMy | Poseify (before) | Poseify (after) | phase | verified how |
|---|---|---|---|---|---|
| Account required | yes | none | none | - | existing advantage |
| Network required | yes | none | none | - | existing advantage |
| Telemetry | yes | none | none | - | existing advantage |
| SEO reference pages | 563 | none | TODO (build-time demo page) | 8 | browser |
| Desktop / mobile builds | yes | none | out of scope | - | n/a |

## Notes on scope decisions

- **Animations** are listed in the gap analysis at 130 clips vs 2400 claimed, but
  no phase in the goal prompt asks for animation generation. Left out of scope and
  recorded here rather than silently dropped.
- **Language** is deliberately not planned. Poseify ships one locale; adding a
  translation system buys nothing an artist uses and costs maintenance.
- **Model count (4b)** is about replacing the 33 vendor FBX with a licence-clean
  path, not about matching PoseMy's 54. The count is not the point; the licence is.
- **Content provenance rule for this run:** every pose, scene and prop that
  ships must be generated by `tools/` code in this repo or hand-authored here.
  Nothing scraped from PoseMy.Art's CDN or bundle may enter the tree. See
  `ATTRIBUTION.md`.

