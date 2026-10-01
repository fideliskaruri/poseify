// Shared camera types.
//
// Kept in their own module so CameraRig and CameraPresets can both depend on
// them without importing each other. A type-only import is erased at runtime,
// but the resulting module cycle is enough to make a bundler resolve one side's
// exports before the other has finished initialising.

/** A camera framing: position, orbit target and field of view. */
export interface CameraPose {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}
