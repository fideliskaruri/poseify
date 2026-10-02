---
date: 2026-10-02
method: live browser (both apps) + static analysis of research/raw/app.js
supersedes_for: transform/shortcut sections of PARITY.md
---

# Parity research — 3D scene transform & scene assembly

Fresh measurement of both apps on 2026-10-02. Supersedes the
`2.1 Transform and manipulation` block of `PARITY.md`, which was written
against a gap analysis rather than against the live site.

Evidence sources:

| Side | Source |
|---|---|
| PoseMy.Art UI | live accessibility tree, `https://posemy.art/app/?lang=en` |
| PoseMy.Art behaviour | `research/raw/app.js`, the shipped 1.2 MB bundle |
| Poseify UI | live accessibility tree, `http://localhost:5173` (dev server) |
| Poseify behaviour | `src/scene/ObjectState.ts`, `src/composables/usePosing.ts`, `src/App.vue` |

## 1. Headline

**Posify already has move, rotate and scale on whole objects, and they
work.** That part of the gap is closed. What is still missing is the layer
*around* the transform: prop-to-joint attachment (the thing in the attached
screenshot), model flipping, light gizmo control, and the anchor and groups
menus as reachable UI.

## 2. Keyboard shortcuts — measured, not assumed

PoseMy's handler is a single `keydown` listener with these key codes, read
out of the bundle:

| Key | Action | Source |
|---|---|---|
| `G` | Move / translate | `onClickMenuTransformMode("translate")` |
| `R` | Rotate | `onClickMenuTransformMode("rotate")` |
| `S` | Scale | `onClickMenuTransformMode("scale")` |
| `F` or `X` | Flip model, and switch pose sides | `flipModel()` |
| `H` | Hide / show object | `toggleHideShowModel` |
| `D` | Delete object (bare) | `deleteModel` |
| `Shift+D` | Duplicate object | `duplicateModel` |
| `Del` | Delete object | `deleteModel` |
| `Esc` | Deselect object | `deselectObject` |
| `Ctrl/Cmd+Z` | Undo | `undo()` |
| `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y` | Redo | `redo()` |
| `Ctrl/Cmd+S` | Save scene (premium) | `saveSceneToFile` |

Tooltips in the bundle confirm the labels: `Move (g)`, `Rotate (r)`,
`Scale (s)`, `Duplicate (Shift + d)`, `Delete (del)`,
`Switch pose sides (f/x)`, `Hide (h)`.

Posify's shortcut set, from `App.vue` and `usePosing.ts`:

| Key | Action | Status |
|---|---|---|
| `G` | Move | parity |
| `Shift+R` | Rotate | **differs from PoseMy's bare `R`** |
| `S` | Scale | parity |
| `Shift+D` | Duplicate | parity |
| `Shift+H` | Hide / show | **differs from PoseMy's bare `H`** |
| `L` | Lock | no PoseMy equivalent binding |
| `R` | Reset pose | **Posify-only; occupies PoseMy's rotate key** |
| `H` | Frame scene | **Posify-only; occupies PoseMy's hide key** |
| `F` / `X` | Switch sides | parity |
| `Del` | Delete | parity |
| `Esc` | Deselect | parity |
| `Ctrl/Cmd+Z` / `+Shift+Z` | Undo / redo | parity |
| `Ctrl/Cmd+,` | Settings | Posify-only |
| `F` (favourites, no model) | Favourites filter | Posify-only |

**The two divergences are deliberate and documented** in `STATUS.md`: `R`
and `H` were already bound to reset-pose and frame-scene, so the object
equivalents moved to the modified keys. Cost is real but small — an artist
coming from PoseMy presses `R`, gets a pose reset, and has to notice. Worth
revisiting only if PoseMy muscle memory is treated as a migration cost.

## 3. Transform gizmo — architectural difference that matters

Both apps use `three/examples/jsm/controls/TransformControls`, and both set
`setSpace("local")`. PoseMy initializes `transformControl.size = 1`.

PoseMy uses **two** controls on the selected model:

- a `TransformControls` for whole-object translate/rotate/scale
- a `DragControls` for IK bone dragging (`dragstart` hides the bone
  controllers and re-enables them on `dragend`)

Posify makes the same split: `ObjectController` in `src/scene/ObjectState.ts`
drives the whole-object gizmo, deliberately kept separate from the
bone-rotation gizmo in `PoseController`. `STATUS.md` records why — their
spaces are incompatible and conflating them breaks bone lengths. This is
correct and should not be "simplified" into one control.

PoseMy additionally thins the gizmo while an object drag is live
(`hideBoneControllers()` on `mouseDown`, `showBoneControllers()` on
`mouseUp`), so bone handles do not fight the object gizmo for the pointer.
Posify does not appear to do this. Small polish item.

## 4. Object operations

| Capability | PoseMy | Posify | Notes |
|---|---|---|---|
| Translate / rotate / scale object | yes | yes | parity |
| Duplicate | yes | yes | Posify copies the pose too |
| Hide / show | yes | yes | parity |
| Lock / unlock | yes | yes | Posify's lock also refuses gizmo attach |
| Delete | yes | yes | parity |
| Recolor | yes | yes | Posify adds a Clear that restores the original |
| **Flip model** | yes (`F`) | **no** | real gap |
| **Attach / detach prop to joint** | yes | **no** | real gap, see section 5 |
| Deselect (`Esc`) | yes | yes | parity |

## 5. The feature in the screenshot

The attached screenshot shows a figure in T-pose with spherical joint handles
and a yellow arrow gizmo — PoseMy's **Attach to Joint** mode. From the
bundle:

```
attachDetachProp(e) {
  e.propAttachInfo ? sceneManager.detachProp(e)
                   : (propToAttach = e, startAttachPropMode())
  commitModelChanges(e)
}
startAttachPropMode() {
  hideTransformControls()
  blinkMaterialUniforms.uTime.value = Math.PI / 10
  blinkMaterialUniforms.isSphereBlinking.value = 1
  blinkMaterialUniforms.isModelBlinking.value = 1
}
```

So: select a prop, press Attach, the joint spheres and the model start
**blinking**, click a joint, and the prop is parented to that bone
(`propAttachInfo` records it, and the button then offers Detach). The
lang strings are `attach_to_joint` / `detach_from_joint` across 8 locales.

Posify has **no equivalent**. The closest is `Anchors` in `src/prefs/`,
which is a preferences-level joint-to-joint or joint-to-prop binding stored
per bone name. That is a different model: anchors are declared ahead of time
in a panel, not picked spatially in the viewport, and there is no
attach-to-joint gesture with visual feedback. This is the single largest
interactive gap found.

## 6. Scene assembly and app chrome

| Control | PoseMy | Posify |
|---|---|---|
| Add Models | yes | yes |
| Add Props | yes | yes |
| Premade Scenes | yes | yes |
| Poses | yes | yes |
| Export | yes | yes |
| Add Image (reference plane) | yes, premium | **no** |
| Camera menu | yes | yes, as a panel |
| **Crop / framing tool** | yes | **no** |
| Directional Light control | yes, floating, with gizmo | yes, panel |
| **Light gizmo on/off toggle** | yes, bottom-left | **no** |
| **Model / joint gizmo on/off toggle** | yes, bottom-left | **no** |
| Undo / Redo | yes | yes |
| Active-model selector | yes | yes |
| Save & Load | yes, premium | yes, free |
| Favorites | yes | yes |
| Community menu | yes | no (by design) |
| Account | yes | no (by design — Posify is accountless) |
| Settings | yes | yes |
| Anchor menu | yes | partial, see section 5 |
| Groups menu | yes | partial, see section 7 |

**Update 2026-10-02, after this research.** The two partials above are now
closed. Joint Groups and Anchors were moved out of the right-hand panel into
the overlay system as first-class rail buttons, matching PoseMy.Art's menu
placement. Verified live: created a group, reset it, created an anchor.

## 7. Gaps in Poseify's groups and anchors

Both subsystems exist in `src/composables/usePosing.ts` with real
implementations — `createGroup`, `deleteGroup`, `resetGroup`, `rotateGroup`,
anchor create/delete with cycle rejection — and both persist through
`usePreferences()`. `PARITY.md` and `STATUS.md` both mark P6 as PASS.

The problem is **reachability**, not correctness. In the live app these are
behind the "Library and tools panel" button, several clicks deep. PoseMy
surfaces them as first-class top-level menu buttons (`groups_menu`,
`anchor_menu` in the bundle's lang table). An artist does not find them.

## 8. Where Posify is already ahead

Recording these so the gap work does not regress them:

- Adjustable grid (cell size + divisions). PoseMy has a floor on/off only.
- Transparent background export. PoseMy does not offer it.
- No account, no network requirement, no telemetry.
- MIT-licensed and free; PoseMy is $15/mo, $150/yr, or $99.99 lifetime.
- Pose clipboard is session-local with no storage dependency.

## 9. Recommended order

1. **Attach / Detach prop to joint** — biggest interactive gap, and the one
   in the screenshot. Needs a pick-a-joint mode with visual feedback, plus a
   `propAttachInfo` equivalent on `PlacedProp`.
2. **Flip model (`F`)** — small, self-contained, and closes a PoseMy parity
   row on its own.
3. **Promote groups and anchors to top-level menu buttons** — the features
   already work; only the entry point is missing. Cheapest win on this list.
4. **Light-gizmo and model-gizmo visibility toggles** — two booleans.
5. **Hide bone controllers during an object drag** — matches PoseMy's
   pointer-competition handling.
6. **Reconsider `R` and `H`** — only if PoseMy muscle memory is judged to be
   a real migration cost. Otherwise leave as documented.
7. **Add Image / crop framing** — genuinely premium-adjacent features; decide
   whether they belong in a free tool at all before building.
