# PoseMy.Art — Reverse-Engineering Research Dossier

Date: 2026-09-30
Target: rebuild as **Poseify** (open source, zero cost)
Method: live browser session (CDP network capture), bundle static analysis, official site/pricing/FAQ scrape, license verification via GitHub API + raw LICENSE files.

> **Superseded in part — read `STATUS.md` first.** This dossier is the
> *original* pre-build research. Two of its recommendations were deliberately
> overridden by the build's own goal prompt, which explicitly authorises
> scraping `posemyart3.nyc3.cdn.digitaloceanspaces.com`:
>
> 1. §7.1/§7.2 advised MPFB/MakeHuman base meshes and primitives-only bots.
>    The shipped library is **33 real FBX files scraped from the PoseMy.Art
>    CDN** — the user rejected hand-built mannequins outright. See
>    `ATTRIBUTION.md` for the licence position this creates.
> 2. §9.6 says "Do not scrape" that CDN. That instruction is **void** for this
>    project; the host is listed as scrapeable in the goal's hard constraints.
>
> Everything else here (rig convention, mocap source, scale factor, OpenPose
> keypoint ordering) remains accurate and load-bearing.

---

## 1. Executive summary

PoseMy.Art is a **browser-based 3D pose reference tool for artists**. It is a Vue 3 + Vuetify single-page app wrapping **Three.js**. The user loads a rigged humanoid, drags joint handles to pose it, loads props/scenes/animation clips, then exports reference images (regular, OpenPose, Depth, Canny, Normals) or the posed figure as OBJ for sculpting.

Critical finding for a zero-cost rebuild: **the entire interaction model depends on one rig convention** — the Mixamo/Maya humanoid skeleton (`Hips`, `Spine`, `Spine1`, `Spine2`, `LeftShoulder`, `RightArm`, ... 20 body bones) plus 42 Mixamo-style finger bones. All 85 of their models share that rig. If Poseify normalizes on the same bone names, every free model, every CMU mocap clip, and every hand pose becomes interchangeable.

---

## 2. Technology stack (verified from shipped bundle)

| Layer | Verified finding | Evidence |
|---|---|---|
| App framework | Vue 3 + **Vuetify 3** | `v-app`, `v-step-621dd5c4`, 126 `vuetify` refs in vendor chunk |
| Build | Vue CLI / webpack | `app.js`, `chunk-vendors.js` hashed bundles |
| 3D engine | **Three.js** | `TransformControls` x25, `OrbitControls`, `Raycaster` |
| Model loading | `FBXLoader` (24 refs), `OBJLoader` | vendor chunk |
| IK solver | `CCDIKSolver` | 1 ref in app.js |
| Skeleton viz | `SkeletonHelper` | vendor chunk |
| State/undo | custom undo/redo stack | `undoButton` / `redoButton`, `Cmd/Ctrl+z`, `Cmd/Ctrl+Shift+z` |
| CDN | `posemyart3.nyc3.cdn.digitaloceanspaces.com` | 198/199 network requests |
| Analytics | `openpanel.dev` | inline `<script>` |
| Payment (their app) | Paddle | FAQ page |

Pose thumbnails follow a strict naming convention on the CDN:
`/extracted_poses_imgs/{poseId}_{frameIndex}_thumbnail.png` — e.g. `5238_0_thumbnail.png`, `5227_1_thumbnail.png`.

---

## 3. Complete UI inventory (from live accessibility tree)

**Top-left toolbar (scene assembly)**
1. Add Models
2. Add Props
3. Premade Scenes
4. Add Image *(premium)*
5. Camera
6. Crop / framing tool

**Top-right toolbar (app-level)**
7. Go Premium (crown)
8. Favorites (heart)
9. Save & Load (floppy)
10. Account (person)
11. Settings (gear)

**Bottom-left**
12. Undo / Redo
13. Toggle: light-direction gizmo on/off
14. Toggle: model/joint gizmo on/off

**Floating contextual**
15. Directional Light control
16. Active-model selector (shows "Realistic Muscular Male")

**Export panel (opens from toolbar; premium-gated as a whole)**
Formats: **Regular, OpenPose, Depth, Canny, Normals** + **OBJ** scene export.

---

## 4. Feature inventory (from pricing page + premium gate keys)

Free tier advertises: Basic Models, Basic Shapes, Inverse Kinematics, Adjustable Camera, Directional Light, Export Open Pose Format.

The premium upsell dialog enumerates the full gated surface — this is effectively their complete feature list:

- 6300+ Poses
- 5500+ Premade Scenes
- 2400+ Animations
- Hand Poses Library
- Props Library
- Save Your Scenes
- Add Custom Props (.obj)
- Add Images
- Realistic Models
- Anime Models
- Animal Models
- Export Scene to .obj

**Pricing (for reference only — Poseify will be free/OSS):**
Monthly $15 / Yearly $150 ($12.50/mo) / Lifetime $99.99 (was $250). Education: $3/student/year. Business/Education: contact.

---

## 5. Model catalog — 85 entries extracted

Full structured catalog saved to `research/model-catalog.csv`.
Fields per model: `id, type:"model", name, boneNames, handBoneNames, hipBoneName, path, thumbnail, boneSize, handBoneSize, hipBoneSize, isPremium, isHidden, isExportable`

**Split: 43 free / 42 premium.**

Bone-handle tuning is per-model and is the reason posing "feels" different on a chibi vs a brute:
- `boneSize` 3.0–4.0, `handBoneSize` 0.8–1.0, `hipBoneSize` 5.0–6.0
- e.g. `Realistic Muscular Male`: 3 / 1 / 6 · `Anime Female`: 3 / 0.8 / 5

**Model families (85 total):**

*Realistic humans* — realistic_muscular_male, realistic_woman, male_brute, female_musculer, male_skinny, female_skinny, male_stocky, female_stocky, male_teen_fit, female_teen_fit, male_age_10, realistic_muscular_male_face, realistic_muscular_fit_male

*Anime/stylized* — anime_female, anime_tall_male, anime_tall_busty_female, anime_big_breast, anime_basic_male, anime_basic_female, anime_child_boy, anime_child_girl, chibi_male, Cartoon_Male_1..4, Cartoon_Female_1/2/4

*Mannequins / simplified* — male_mannequin, womannequin, manneuin_frame, Female_Mannequin_Frame_v1/v2, Female_Simplified_Skeleton, Male_Simplified_Skeleton, stick_bot, blocky_bot, square_stick_bot

*Bots* — xbot_opt / ybot_opt (raw Mixamo XBot/YBot), x_bot_fixed / y_bot_fixed, new_X_bot / new_Y_bot, y_bot_brute

*Skeleton* — skeleton_OP_IK

*Animals* — horse, wolf, werewolf, cat, bear, bull, cow, deer, kangaroo, Bonnet_Macaque, female_mermaid, male_mermaid

*Zombie/Alien* — zombie_alien

**Rig variants:** most humanoids ship in two files — `*_OP_IK.fbx` and `*_OP_Y_IK.fbx`. The `_Y_` variants are a second pose/skeleton variant (OP = OpenPose-capable). Poseify needs only one normalized rig, not both.

**Exportability:** 29 models have `isExportable:!1` (OBJ-exportable). Animals/mermaids/werewolf are not exportable.

---

## 6. Skeleton contract (the single most important integration detail)

**Body bones (20, exact order from bundle):**
```
RightUpLeg, LeftUpLeg, LeftLeg, RightLeg, LeftFoot, RightFoot, LeftToeBase, RightToeBase,
Hips, Spine, RightForeArm, RightArm, Neck, Head, LeftArm, LeftForeArm, Spine1, Spine2,
LeftShoulder, RightShoulder
```

**Hand bones (42, bundle array `Oe`)** — full Mixamo finger naming:
`LeftHand` + `LeftHand{Index,Middle,Ring,Pinky,Thumb}1..4`, and the same for `RightHand`.

**Hip bone name:** `Hips` (bundle var `Ge`).

This is the **Mixamo skeleton**. Any model retargeted to these names works with the same posing code.

---

## 7. Free / open-source asset sourcing (all verified, but see the superseded notes in 7.1 / 7.2)

### 7.1 Humanoid base meshes — MakeHuman assets are CC0 1.0 *(route NOT taken)*

> **Superseded.** This section's licensing analysis is correct, but the
> recommendation was overridden: the shipped catalogue is 33 scraped vendor
> FBX, not MPFB-generated meshes. Kept for provenance only.

Verified from `makehumancommunity/makehuman` LICENSE.md:
- **Section C**: "The assets ... base mesh and proxies, targets and modifiers, textures, clothes, poses and expressions ... released under **CC0 1.0 Universal**."
- **Section D**: output (FBX/OBJ exports, renders, screenshots) carries "no trace of program logic" and is yours unrestricted.
- **Section B**: only the *source code* is AGPL — irrelevant if you don't ship MakeHuman's code.

**Trap:** `NOASSERTION` on GitHub means split licensing. Keep MakeHuman's **code** (AGPL) out of Poseify. Use only CC0 **assets**, or use the MPFB Blender addon which is a separate AGPL tool you run offline to export GLB/FBX.

Recommended tools (all AGPL/CC0, run offline, export to GLB/FBX):
- **MPFB** — MakeHuman for Blender 4.x (recommended, actively maintained)
- **MB-Lab** — MakeHuman for Blender (older, 2020-era; 2k stars)

This single source gives you: realistic male/female, young/teen/child, brute, skinny, stocky, muscular, old — i.e. most of PoseMy's 42 premium realistic models, CC0, generated, not downloaded.

### 7.2 Biped reference robots — **Mixamo XBot/YBot**

PoseMy ships `xbot_opt.fbx` / `ybot_opt.fbx` — these are Adobe Mixamo's robot mannequins, retargeted. **Do not redistribute these FBX files** — Mixamo's terms restrict redistribution of the character assets. Instead: *(Superseded: both files are in the shipped catalogue and carry the same non-redistributable caveat as the rest of the vendor set — see `ATTRIBUTION.md`.)*

- Generate your own equivalent from primitives, or
- Use the CC0 sources below and skip Mixamo entirely.

The `_bot` / `stick_bot` / `blocky_bot` family is trivially reproducible as Three.js primitive geometry with a Mixamo-named bone hierarchy — that is a better path than any asset download.

### 7.3 Mocap animation — **CMU Graphics Lab Motion Capture Database**

Verified live: `http://mocap.cs.cmu.edu/` — "The database contains **free motions which you can download and use**." Format: ASF/AMC (skeleton + motion), 41 markers, Vicon 120Hz. Also available as C3D. Scale factor to convert to meters: `0.056444`.

This is the source PoseMy's "2400+ mocap animations" almost certainly derives from — CMU has ~2400 motion clips. Formats are ASF/AMC, so you need a retarget step (ASF/AMC -> your rig) at build time, not runtime.

### 7.4 Engine + libraries (all MIT)

| Component | License | Use |
|---|---|---|
| three.js | MIT | renderer, FBXLoader, OBJLoader, OrbitControls, TransformControls, SkeletonHelper |
| Vuetify | MIT | UI (or use plain CSS/Tailwind — no obligation) |
| Vue 3 | MIT | app shell |
| three-vrm (pixiv) | MIT | optional VRM import |
| three-gltf-viewer (donmccurdy) | MIT | optional |

Verified via GitHub API: `mrdoob/three.js` = MIT, `pixiv/three-vrm` = MIT, `donmccurdy/three-gltf-viewer` = MIT.

### 7.5 Hand poses

Open hand/gesture data is derivable: Mixamo finger bone names are a de-facto standard and CMU includes hand motion. Generating a hand-pose library from authored joint rotations is cheaper than sourcing files.

---

## 8. What PoseMy does NOT have (scope boundaries observed)

- No physics simulation
- No character creator / morph sliders (MakeHuman-class tooling is absent)
- No cloth/hair sim
- No timeline keyframing UI beyond animation playback + frame scrub (premade clips only)
- No multiplayer / collaboration
- No AI/ML features
- Desktop builds exist (Windows/Mac/Linux/iOS/Android) per `/download/` but the FAQ states **"The app will not work without an internet connection"** — i.e. it's a wrapped web app, confirming a web-first architecture is the right target.

---

## 9. Technical risks for the rebuild

1. **Rig normalization is the whole ballgame.** Every model, pose, animation, and hand preset must land on one bone-name convention. Build the retargeter first.
2. **ASF/AMC -> rig retargeting** for CMU mocap is real work; budget for a build-time Blender/three.js script, not runtime parsing.
3. **Hand IK** with 42 finger bones is where posing tools usually feel bad. Mirror PoseMy's approach: hand bones get a smaller gizmo size (0.8–1.0 vs 3–4) and likely a dedicated hand mode.
4. **OpenPose export fidelity** requires exact COCO-18 + face/foot keypoint mapping from the 62-bone rig. Get the joint index order right or every downstream ControlNet user gets garbage.
5. **Performance:** 85 models x FBX + textures. Use Draco/KTX2, lazy-load on selection, cache aggressively.
6. **Legal:** the app's *interaction design* is not copyrightable, but their **FBX files, pose data, scene data, prop meshes, and thumbnails are their assets**. *Superseded:* the goal prompt authorises scraping `posemyart3.nyc3.cdn.digitaloceanspaces.com`, so the shipped library is vendor FBX rather than CC0-only. Those files stay gitignored, are fetched at install time, and `ATTRIBUTION.md` states plainly that they are **not** MIT or CC0 and must be removed or replaced before redistribution.

---

## 10. Reproduction evidence

| Artifact | Path |
|---|---|
| Shipped app bundle (1.2 MB) | `research/raw/app.js` |
| Vendor bundle (2.0 MB) | `research/raw/chunk-vendors.js` |
| Extracted 85-model catalog | `research/model-catalog.csv` |
