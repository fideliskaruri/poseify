# Poseify — Build Status

Goal: free, open-source, browser-based 3D pose reference tool (PoseMy.Art equivalent).
Stack fixed: Vue 3 + Vite + TypeScript + Three.js. Zero paid cost.

Last updated: 2026-09-30

## Milestone state

| Milestone | State | Verification |
|---|---|---|
| M0 — Scaffold | **PASS** | `npm run dev` serves; WebGL canvas renders grid + orbit controls (confirmed in-browser); `npm run build` succeeds |
| M1 — Rig contract + retargeter | **PASS** | 23/23 vitest tests green + typecheck clean. Mixamo-named skeleton validates clean; scrambled skeleton fails with non-empty `missing`; three-tier retarget (exact / alias / heuristic) covered including fail-loudly |
| M2 — Model loading + posing core (FK/IK) | TODO | — |
| M3 — Model library (all CC0) | TODO | — |
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
