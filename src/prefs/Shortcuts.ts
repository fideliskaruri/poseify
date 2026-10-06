// Keyboard shortcuts, resolved as pure data so they can be unit tested without
// a DOM. `resolveShortcut` returns the action name, or null when the event
// should be left alone (text entry, browser-reserved chords, unknown keys).

export type ShortcutAction =
  | "undo"
  | "redo"
  | "delete"
  | "resetPose"
  | "gizmoTranslate"
  | "gizmoRotate"
  | "gizmoScale"
  | "duplicateObject"
  | "toggleHidden"
  | "toggleLock"
  | "switchPoseSides"
  | "resetJoint"
  | "toggleFavorites"
  | "openSettings"
  | "togglePlayback"
  | "frameScene"
  | "cancelAttach"
  | "help";

interface Chord {
  action: ShortcutAction;
  /** Lower-case key, as reported by KeyboardEvent.key. */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

const CHARTS: readonly Chord[] = [
  { action: "undo", key: "z", ctrl: true, shift: false },
  { action: "redo", key: "z", ctrl: true, shift: true },
  { action: "redo", key: "y", ctrl: true },
  { action: "delete", key: "delete" },
  { action: "delete", key: "backspace" },
  { action: "resetPose", key: "r" },
  // Phase 1 object gizmo. R and H are already reset-pose and frame-scene, so
  // the object equivalents are Shift+R and Shift+H. Modifier matching is exact
  // in resolveShortcut, so these never shadow the bare keys.
  { action: "gizmoTranslate", key: "g" },
  { action: "gizmoRotate", key: "r", shift: true },
  { action: "gizmoScale", key: "s" },
  { action: "duplicateObject", key: "d", shift: true },
  { action: "toggleHidden", key: "h", shift: true },
  { action: "toggleLock", key: "l" },
  // Switch Pose Sides is f/x on a typical pose reference tool. F is already the favourites
  // filter here, so the flip binds to X and F stays put.
  { action: "switchPoseSides", key: "x" },
  { action: "resetJoint", key: "r", alt: true },
  { action: "toggleFavorites", key: "f" },
  { action: "openSettings", key: "," , ctrl: true },
  { action: "togglePlayback", key: " " },
  { action: "frameScene", key: "h" },
  // Escape backs out of attach mode before it deselects anything, so a
  // half-finished attach can be abandoned without losing the selection.
  { action: "cancelAttach", key: "escape" },
  { action: "help", key: "?" },
];

/** True when the event originated in a field the user is typing into. */
export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

export function resolveShortcut(event: KeyboardEvent): ShortcutAction | null {
  if (isTextEntry(event.target)) return null;
  // A modifier combination we do not map must not fall through to a bare-key
  // match, or Cmd+R would reframe the camera instead of reloading.
  const ctrl = event.ctrlKey || event.metaKey;
  const key = (event.key ?? "").toLowerCase();
  if (!key) return null;

  for (const chord of CHARTS) {
    if (chord.key !== key) continue;
    // Modifiers must match exactly. Testing "was shift required" rather than
    // "does shift match" makes plain Ctrl+Z shadow Ctrl+Shift+Z, because undo
    // is listed first.
    if (chord.ctrl === true && !ctrl) continue;
    if (chord.ctrl !== true && ctrl) continue;
    if ((chord.shift ?? false) !== event.shiftKey) continue;
    if ((chord.alt ?? false) !== event.altKey) continue;
    return chord.action;
  }
  return null;
}

export const SHORTCUT_HELP: readonly { keys: string; label: string }[] = [
  { keys: "Ctrl/Cmd + Z", label: "Undo" },
  { keys: "Ctrl/Cmd + Shift + Z", label: "Redo" },
  { keys: "Delete / Backspace", label: "Remove selected model or prop" },
  { keys: "R", label: "Reset the selected model's pose" },
  { keys: "G", label: "Move the selected object" },
  { keys: "Shift + R", label: "Rotate the selected object" },
  { keys: "S", label: "Scale the selected object" },
  { keys: "Shift + D", label: "Duplicate the selected object" },
  { keys: "Shift + H", label: "Show / hide the selected object" },
  { keys: "L", label: "Lock / unlock the selected object" },
  { keys: "X", label: "Switch Pose Sides (mirror the whole body)" },
  { keys: "Alt + R", label: "Reset the selected joint only" },
  { keys: "F", label: "Show only favourited models" },
  { keys: "Space", label: "Play / pause the animation clip" },
  { keys: "H", label: "Frame the scene in the viewport" },
  { keys: "Ctrl/Cmd + ,", label: "Open settings" },
  { keys: "?", label: "Show this list" },
];
