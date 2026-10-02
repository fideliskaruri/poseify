---
date: 2026-10-02
author: iamtyroon
status: master prompt, hand this to the next model
---

# Poseify — Master Prompt V3

You are fixing **Poseify**, a free open-source browser-based 3D pose reference
tool at `C:\Users\Tyroon\Desktop\projects-backup\posify`. It is a PoseMy.Art
equivalent: Vue 3 + Vite + TypeScript + Three.js, free forever, no account, no
network requirement, no telemetry.

The previous build is **functionally complete on paper and visibly broken in
practice**. Its own `STATUS.md` claims nine phases PASS. The app in the browser
disagrees. Trust the browser, not `STATUS.md`.

Read this whole document before touching code. Then work the sections in the
order given. Section 1 is a blocker: nothing else is visible until it is fixed.

---

## 0. Ground rules

- **Verify in a real browser, every time.** A feature is not done because the
  type checker passes. It is done when you have a screenshot showing it working
  and a `renderer.info.render.triangles` number that is not 2.
- **Never trust `STATUS.md`.** It is aspirational. Correct it as you go, or
  delete the rows that turn out to be false.
- **Every commit is authored by the repo owner, `iamtyroon`.** Do not add
  yourself, Codex, Claude, GPT, Copilot, "AI assistant", or any tool name to
  commit authorship, trailers, or `Co-Authored-By`. `git log --format='%an %ae'`
  must show only `iamtyroon` on every commit you create. Check this before you
  push, every time.
- Do not add new runtime dependencies without a stated reason. Three.js already
  ships everything needed below.
- Do not "simplify" the two-gizmo design. See section 3.3 — it is deliberate.

---

## 1. BLOCKER: the render loop dies on the first frame

### Symptom

You add a model. The toolbar appears with Move / Rotate / Scale, the object
panel populates, the joints list fills, and the status says `running`. The grid
and light draw. **The figure never appears.** The canvas shows empty grid.

`Frame scene` does nothing, because it measures bounds of geometry that is
never being submitted.

### Confirmed diagnosis

This was measured with Chrome DevTools Protocol against the running app.

    renderer.info.render = { calls: 3, triangles: 2, lines: 92, frame: 169 }
    renderer.info.render.frame  ->  169 before and after 2.5s   (loop is DEAD)

Console, repeating every frame until the loop dies:

    ReferenceError: Cannot access 'props2' before initialization
        at updateAnchors (src/composables/usePosing.ts:418:28)
        at vp.onFrame      (src/composables/usePosing.ts:675:7)
        at loop            (src/renderer/Viewport.ts:72:21)

`props2` **does not exist anywhere in the repository** — not in the working
tree, not in `git show HEAD`. It is a stale Vite HMR module left behind by
repeated hot-edits of `usePosing.ts`. The composable's module scope got
corrupted, `updateAnchors` throws before `controls.update()` and
`renderer.render()` are ever reached, and because the throw happens *inside*
`vp.onFrame`, which is called from inside `requestAnimationFrame`, the whole
render loop stops permanently. Every model loaded afterwards stays invisible.

### What is NOT wrong (already ruled out, do not re-investigate)

These were all measured and are healthy. Do not "fix" them.

| Thing | Measured value | Verdict |
|---|---|---|
| FBX file exists | `public/vendor/pose-my-art/realistic_muscular_male_OP_IK.fbx`, 4840 KB | fine |
| Load time | 579 ms | fine |
| Loaded bounding box | `1.752 x 1.750 x 0.326` m | correct, human-sized |
| Root position / scale | `[0,0,0]` / `1.0000` | fine |
| Skeleton | `valid: true`, **62 bones resolved** | fine |
| `Head` world position | `[0, 1.528, -0.042]` | correct, 1.5 m up |
| `Hips` world position | `[0, 0.961, -0.006]` | correct |
| Mesh material | `MeshPhongMaterial`, `transparent: false`, `opacity: 1`, `color: #cccccc`, `depthWrite: true` | fine |
| Mesh visibility | `visible: true` | fine |
| Backface culling | forced `DoubleSide` plus `frustumCulled = false` made **zero** difference | not the cause |
| Camera | `[1.02, 1.46, 1.837]`, fov 50, aspect 1.25 | correct, looks at the figure |
| Canvas size | `1115 x 891` | fine |
| `attachModel()` | calls `vp.scene.add(root)`, then `PosableSkeleton`, then validates | correct |

The model is in the scene, correctly positioned, correctly scaled, correctly
skinned, with an opaque material, and the camera is pointed straight at it.
**Nothing is being drawn because nothing is being rendered.**

### The fix

1. Kill any running dev server, delete `node_modules/.vite`, restart. Confirm
   `renderer.info.render.frame` now advances over time and `triangles` is in the
   tens of thousands with a model loaded. Do not proceed until it does.
2. Make the render loop **fail loudly and survive**. Wrap the `onFrame` body so
   one bad callback cannot kill the loop forever. In `src/renderer/Viewport.ts`,
   inside `start()`'s loop:

       try {
         this.onFrame?.(delta);
       } catch (err) {
         // Report once, then keep rendering. A dead render loop is invisible:
         // the UI still looks alive while the canvas silently freezes.
         console.error("onFrame threw; continuing to render", err);
       }
       this.controls.update();
       this.renderer.render(this.scene, this.camera);

   Log the error once, not every frame.
3. Audit the whole of `usePosing.ts` for other HMR corruption from this
   session: undeclared identifiers, `const` used before its declaration inside
   the same module scope, duplicate declarations left behind by an edit.
   `props2` is the one that was caught; assume there are others. `tsc` does
   **not** catch a TDZ violation on a name that no longer exists — only a real
   typecheck or a browser run does.
4. Add a regression test that the render loop survives a throwing `onFrame`.

### Why this matters for everything else

Sections 2 through 6 were all built and "verified" while this loop was dead.
**Every browser-based claim in `STATUS.md` is unverified.** Re-verify each one
against a live render before you trust it.

---

## 2. Generated poses must be deleted, not fixed

### The complaint

Many poses in the library are bad — limbs at wrong angles, figures floating,
feet through the floor, anatomically impossible stances. Do not tune them.
**Delete the whole generated library.**

### What to do

- Remove every procedurally generated pose. `src/pose/GeneratedPoseLibrary.ts`
  and whatever `tools/build-pose-library.ts` produces.
- Remove the generated pose assets and the build step that regenerates them.
  Remove the `poses:generate` npm script.
- **The only poses that ship are the ones scraped from the PoseMy.Art CDN**,
  which is `posemyart3.nyc3.cdn.digitaloceanspaces.com`.
- Read `research/model-catalog.csv` and `research/raw/app.js` for the exact
  CDN paths. The naming convention is
  `/extracted_poses_imgs/{poseId}_{frameIndex}_thumbnail.png`.
- Keep the hand-pose library (`src/pose/HandPoseLibrary.ts`, 9 poses x 2 sides)
  — those are authored in-repo and are fine.
- Update `ATTRIBUTION.md`. The scraped poses are vendor content behind
  PoseMy.Art's paywall and are not MIT. State that plainly, the same way the
  model FBX provenance is already stated.
- Update `STATUS.md`: the pose count is no longer 1,298 and no longer 98. It is
  whatever the CDN scrape yields. Say the real number.

### Pose application must actually work

Independently of *which* poses ship, the act of applying a pose is broken or
unverified. Fix and prove this:

- Clicking a pose applies it **to the correct bone names**. The rig contract is
  the Mixamo/Maya skeleton; see section 6.
- The figure visibly changes in the viewport. Verify with a screenshot, not by
  asserting on a quaternion.
- A pose applied to any of the 33 models does not throw, does not silently
  no-op, and does not leave the figure half-posed.
- Poses carry the same `rootOffset` concept PoseMy.Art uses so a seated pose
  sits on the floor. There is an `In place` toggle already; make sure it works.

---

## 3. Visible, Blender-style joint gizmos

### The complaint

This is the feature in the screenshot the owner was given: PoseMy.Art draws a
coloured **sphere on every joint**. You click one and get a rotation gizmo with
the three rings. Poseify has *none of that* — bone picking is invisible.

### Current state, verified

`src/posing/PoseController.ts` already implements invisible picking. `pickBone()`
finds the nearest contract bone to the pointer ray by ray-to-point distance:

    const tolerance = this.pickRadius * (distance / 10 + 0.5);
    if (distance < tolerance && (!best || distance < best.distance)) { ... }

That is why posing *feels* imprecise and why there is nothing to look at. The
raycast works; there is simply no visual affordance and no ring gizmo.

### What to build

1. **Render a visible handle on every joint.** A small sphere per poseable
   bone, parented to the scene (not to the bone), re-placed each frame from
   `bone.getWorldPosition(...)`. Do not parent handles to bones: a UI object
   inside a rig gets dragged around by pose edits.
2. **Use the model's own tuning for handle size.** `skeleton.gizmoSize(name)`
   returns roughly `3-4` for body bones and `~1` for fingers. Scale and clamp
   it into a sane radius range. A chibi and a brute both need handles you can
   actually hit.
3. **Draw the rotation rings.** When a joint is selected, attach a proper
   rotation gizmo: the three coloured rings (X red, Y green, Z blue) around the
   joint. Blender-style. This is the single most-requested missing feature.
   Three.js has `TransformControls` in `rotate` mode, and `three/examples/jsm`
   also ships gizmo primitives you can assemble. Build a dedicated joint gizmo
   rather than reusing the object gizmo — see section 3.3.
4. **Translate handles too**, matching PoseMy.Art: the joint handles should be
   draggable, not only rotatable. Anything you can do in a 3D space, visually.
5. Handle colour by chain so the figure reads at a glance, roughly like
   PoseMy.Art's screenshot: spine green, limbs red/blue by side, hands
   finger-coloured. Exact palette is your call, but chain grouping must be
   legible.
6. Add a **handles toggle**. PoseMy.Art has one; Poseify's owner asked for it.
7. Joint handles must not intercept an orbit drag or fight the gizmo for the
   pointer. Stub `mesh.raycast` and pick in JS from bone positions.

There is an unfinished implementation of exactly this in the working tree:
`src/posing/JointHandles.ts` and `src/scene/PropAttach.ts`, with 10 passing
tests in `src/scene/__tests__/PropAttach.test.ts`. They were written by a
previous agent, never verified in a browser, and they are the most likely source
of the `props2` corruption in section 1. **Read them, salvage what is correct,
and be prepared to delete them.** Do not assume they work.

### 3.3 Do not merge the two gizmos

There are two `TransformControls` instances and that is deliberate:

- `ObjectController` (`src/scene/ObjectState.ts`) — whole-object
  translate/rotate/scale.
- `PoseController` (`src/posing/PoseController.ts`) — single-joint rotation.

Their transform spaces are incompatible and conflating them breaks bone
lengths. Keep them separate.

### 3.4 Attach prop to joint

PoseMy.Art's `attachDetachProp` lets you pin a prop to a bone so it follows the
figure. From their shipped bundle:

    attachDetachProp(e) {
      e.propAttachInfo ? sceneManager.detachProp(e)
                       : (propToAttach = e, startAttachPropMode())
    }
    startAttachPropMode() {
      hideTransformControls()
      blinkMaterialUniforms.isSphereBlinking.value = 1
      blinkMaterialUniforms.isModelBlinking.value = 1
    }

Select a prop, press Attach, joint spheres blink, click a joint, the prop is
parented to that bone. `propAttachInfo` stores the bone and an offset.

The existing `PlacedProp.attach` / `PropAttach` shape in the working tree is a
reasonable model for this and survives save/load. Verify it properly or replace
it. It has never been seen working in a browser.

---

## 4. UI: quality-of-life, placement, spacing, responsiveness

### The complaints, verbatim

- "once I click a model, I have to... it doesn't close the thing automatically"
- "the UI doesn't have quality of life features"
- "the UI being bad, being placed wrongly, spacing"
- "fix the UI responsiveness"

### 4.1 Overlays must close themselves

Clicking a model, a prop, or a preset in an overlay currently leaves the
overlay open on top of the result. Every one of these must close the overlay and
show the result:

- picking a model from Add Models
- picking a prop from Add Props
- picking a preset scene from Premade Scenes
- picking a pose from Poses

Exceptions: Add Props stays open if the flow is explicitly multi-add, and
Escape or the X always closes.

### 4.2 Placement and spacing

- The context toolbar (Move/Rotate/Scale/...) is positioned with `position:
  fixed` offsets that collide with the right-hand panel. It already has a
  `with-panel` modifier; make the offsets correct at every panel width.
- The status pill at `top: 16px` sits under the top-left rail and reads as part
  of it. Move it so it cannot be mistaken for a rail button.
- Nothing may overlap: rails, context toolbar, status, panels, overlays, canvas.
- Panels must not cover the figure's working area. If a panel is open, the
  canvas should stay usable.
- Consistent spacing scale. Pick one (4/8/12/16/24) and use it. Right now
  spacing is ad hoc per component.
- Text must fit its container at every viewport width, including narrow
  windows. No clipped labels, no overflow.

### 4.3 Quality of life

- **Keyboard shortcuts, listed in the settings sheet**, so they are
  discoverable. The sheet exists; it is incomplete.
- Shortcuts must not fire while typing in a field. There is an `isTextEntry`
  guard; confirm it actually works for every input, including `contenteditable`.
- Confirm destructive actions (Delete) or make Undo reliable enough that they
  are not needed. Undo exists — verify it works.
- Loading state while a model FBX loads. 579 ms is not instant and a bigger
  model will be worse.
- Empty states everywhere. "No groups yet" already exists in one place; make
  it the rule.
- Every action reports its outcome. The owner should never press something and
  see nothing happen.

### 4.4 Performance and memory

- **Do not render 5,170 pose tiles into the DOM.** The reference library mounts
  every pose card at once; the accessibility tree for one page was measured at
  **2,978 nodes** and every browser tool call dumps all of it. Virtualise the
  list, or paginate it hard.
- Thumbnails: check they are lazy-loaded and cached. Do not hold 5,000 decoded
  images in memory.
- Dispose what you allocate. Model roots, geometries, materials and textures
  need explicit disposal when a model or scene is removed or replaced.
- Target: 60 fps with a model loaded and handles visible. Measure, do not
  assume.
- Check for a leak: load and delete a model ten times, then compare
  `renderer.info.memory` and `renderer.info.programs.length` before and after.

---

## 5. Shader / material quality

### The complaint

PoseMy.Art does not look like a flat dark viewport. The figure pops — it reads
as a clean, well-lit sculpt. Poseify looks flat and muddy by comparison.

### What to do

- Inspect how PoseMy.Art's bundle shades its models. `research/raw/app.js` is
  their shipped 1.2 MB bundle and is already in the repo; `research/FINDINGS.md`
  documents their stack.
- Their base material is `MeshPhongMaterial` with a light grey base colour
  (`#cccccc`), which is what the FBX files already carry.
- Improve the **environment**, not just the material: stronger key light,
  softer fill, a subtle rim, and a tone-mapping change if it helps. The current
  `HemisphereLight` intensity and the `DirectionalLight` defaults are the first
  place to look.
- Consider a subtle fresnel rim in an `onBeforeCompile` patch rather than
  swapping the material, so skinning and existing vertex data keep working.
- Ship it as a **toggleable preset** ("Studio", "Matcap/clay", "Flat"), because
  an artist exporting reference images needs the neutral one and the viewport
  reading model benefits from the lit one.
- The look must not change what the export passes produce. Verify Regular,
  Depth, Canny, Normals and OpenPose still render correctly with the shader on.

---

## 6. Scrape the CDN for free pre-made scenes

### The request

There are free pre-made scenes on the PoseMy.Art CDN. Scrape them and ship them,
replacing the generated scene library.

### What to do

- Host is `posemyart3.nyc3.cdn.digitaloceanspaces.com`. Only free content.
  `isPremium` flags are in `research/model-catalog.csv` and in the shipped
  bundle's lang/data tables — filter on them and do not ship premium entries.
- Scene thumbnails already follow
  `/extracted_poses_imgs/{poseId}_{frameIndex}_thumbnail.png`. Find the
  equivalent path for scenes.
- `src/scene/GeneratedScenes.ts` and `tools/build-scene-library.ts` are the
  generated path to delete, along with the `scenes:generate` npm script.
- Persist the scrape as a checked-in index (JSON/CSV) plus a fetch script, the
  way the models already work, so the build is reproducible and the data is
  reviewable. Keep the vendor assets gitignored if that is the current
  arrangement — do not change the licence posture without saying so.
- Every scraped scene must be **loadable and visible**. A scene that loads but
  renders nothing is the section 1 bug again, wearing a different hat. Verify by
  screenshot.
- Update `ATTRIBUTION.md` and `STATUS.md` with the real counts.

---

## 7. The parity tracker is not trustworthy

`research/PARITY.md` and `STATUS.md` are full of `PASS` rows that were verified
against a dead render loop. Treat every browser claim in them as unproven.

- Re-verify row by row against a live renderer.
- Change each row to reflect what you actually observed, including `FAIL` and
  `unverified`.
- Keep the honest state visible. A tracker that says PASS while the canvas is
  empty is worse than no tracker.

For reference, the parity research at
`research/PARITY-LIVE-2026-10-02.md` measured PoseMy.Art directly (live
accessibility tree plus static analysis of their bundle) and is sound. Its
measured shortcut table is:

| Key | PoseMy.Art |
|---|---|
| `G` / `R` / `S` | Move / Rotate / Scale |
| `F` / `X` | Flip model, switch pose sides |
| `H` | Hide / show |
| `D` / `Del` | Delete |
| `Shift+D` | Duplicate |
| `Esc` | Deselect |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Redo |

Poseify currently uses `Shift+R` for rotate and `Shift+H` for hide because bare
`R` and `H` were taken by reset-pose and frame-scene. Poseify also has `L` for
lock, which PoseMy.Art has no binding for. Decide deliberately and document the
choice; `Shift+R` silently doing something else is a real papercut for anyone
moving over from PoseMy.Art.

---

## 8. Definition of done

Do not claim any of this is finished until all of it is true and you have the
evidence:

- [ ] `renderer.info.render.frame` advances continuously; a loaded model renders
      tens of thousands of triangles; a screenshot shows the figure.
- [ ] One throwing `onFrame` callback cannot kill the render loop. Tested.
- [ ] No generated poses ship. CDN-scraped poses only. Counts in `STATUS.md`
      are real.
- [ ] Clicking a pose visibly changes the figure, on every model, verified by
      screenshot.
- [ ] Every joint has a visible, clickable handle, sized per model.
- [ ] Selecting a joint shows Blender-style rotation rings; handles drag to
      translate.
- [ ] A prop can be attached to a joint and follows the pose, and detaches.
- [ ] Overlays close on selection. Nothing overlaps. Spacing is consistent.
- [ ] Pose list is virtualised. No 2,978-node accessibility tree.
- [ ] Ten load/delete cycles show no growth in `renderer.info.memory`.
- [ ] Material/lighting preset ships and does not break any export pass.
- [ ] Free pre-made scenes scraped from the CDN, loadable, visible, licence
      position updated.
- [ ] `npm run typecheck`, `npm test` and `npm run build` all pass.
- [ ] `git log --format='%an %ae'` shows only `iamtyroon` on every commit.

## 9. Where the evidence is

| Path | What it holds |
|---|---|
| `research/PARITY-LIVE-2026-10-02.md` | Measured PoseMy.Art parity, shortcuts, gaps |
| `research/FINDINGS.md` | Reverse-engineering dossier: stack, rig contract, CDN paths |
| `research/model-catalog.csv` | 85 models with bone names, bone sizes, premium flags |
| `research/raw/app.js` | PoseMy.Art's shipped 1.2 MB bundle |
| `research/raw/chunk-vendors.js` | Their vendor bundle |
| `ATTRIBUTION.md` | Licence position for vendor assets |
| `STATUS.md` | Build status — **unreliable, see section 7** |
| `research/PARITY.md` | Feature tracker — **unreliable, see section 7** |

## 10. A note on how this went before

The previous agent marked nine phases PASS and shipped a parity table, then
could not tell that the render loop had been dead the entire time. It also left
an unverified feature in the tree that made the loop worse.

The lesson is the whole point of section 0: **the browser is the source of truth,
and a claim counts as verified only when you have looked at it.** Do not write
`PASS` because the code reads correctly. Write it because you saw it work.
