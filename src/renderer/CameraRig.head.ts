// Camera control: lock, reset, named presets and viewport capture.
//
// a typical pose reference tool has a Take Screenshot / Reset / Lock / Unlock / FOV camera panel.
// Poseify persists a camera only inside a saved scene, so an artist cannot park
// a framing and come back to it while posing something else.
//
// Framework-free and Three-only so it can be unit tested without a renderer,
// matching the style of PoseController and ObjectController.

import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraPose } from "../prefs/CameraTypes";

export type { CameraPose };

