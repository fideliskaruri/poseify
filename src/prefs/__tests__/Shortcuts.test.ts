import { describe, expect, it } from "vitest";
import { isTextEntry, resolveShortcut } from "../Shortcuts";

// Tests run in the node environment, which has no KeyboardEvent constructor.
// resolveShortcut reads a handful of fields off the event, so a plain object
// with the same shape exercises the same code path.
function key(
  k: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    ...opts,
  } as unknown as KeyboardEvent;
}

// Tests run in the node environment, so there is no document to create
// elements from. resolveShortcut only reads tagName/isContentEditable off the
// target, so a plain stand-in exercises the same branch.
function field(tag: string): KeyboardEvent {
  return {
    key: "r",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { tagName: tag, isContentEditable: false },
  } as unknown as KeyboardEvent;
}

describe("resolveShortcut", () => {
  it("maps the Phase 1 object gizmo shortcuts", () => {
    expect(resolveShortcut(key("g"))).toBe("gizmoTranslate");
    expect(resolveShortcut(key("s"))).toBe("gizmoScale");
    expect(resolveShortcut(key("l"))).toBe("toggleLock");
  });

  it("keeps R as reset pose and puts object rotate on Shift+R", () => {
    // R was already bound to resetPose, so object rotation takes the modified
    // key. If these ever collide, the bare key would silently win.
    expect(resolveShortcut(key("r"))).toBe("resetPose");
    expect(resolveShortcut(key("r", { shiftKey: true }))).toBe("gizmoRotate");
  });

  it("keeps H as frame scene and puts hide on Shift+H", () => {
    expect(resolveShortcut(key("h"))).toBe("frameScene");
    expect(resolveShortcut(key("h", { shiftKey: true }))).toBe("toggleHidden");
  });

  it("maps duplicate on Shift+D and never on bare D", () => {
    expect(resolveShortcut(key("d", { shiftKey: true }))).toBe("duplicateObject");
    expect(resolveShortcut(key("d"))).toBeNull();
  });

  it("does not let the object shortcuts shadow browser chords", () => {
    // Ctrl+G and Ctrl+R belong to the browser; a bare-key match would swallow
    // them, which is exactly the failure the modifier check exists to stop.
    expect(resolveShortcut(key("g", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(key("r", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(key("s", { ctrlKey: true }))).toBeNull();
  });

  it("maps undo and redo", () => {
    expect(resolveShortcut(key("z", { ctrlKey: true }))).toBe("undo");
    expect(resolveShortcut(key("Z", { metaKey: true }))).toBe("undo");
    expect(resolveShortcut(key("z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(resolveShortcut(key("y", { ctrlKey: true }))).toBe("redo");
  });

  it("does not fire a bare-key shortcut while a modifier is held", () => {
    // Cmd+R must reload the page, not reframe the camera.
    expect(resolveShortcut(key("r", { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(key("h", { metaKey: true }))).toBeNull();
    expect(resolveShortcut(key("f", { ctrlKey: true }))).toBeNull();
  });

  it("still fires modifier shortcuts", () => {
    expect(resolveShortcut(key(",", { ctrlKey: true }))).toBe("openSettings");
  });
  it("does not fire openSettings without the modifier", () => {
    expect(resolveShortcut(key(","))).toBeNull();
  });

  it("maps the bare keys", () => {
    expect(resolveShortcut(key("r"))).toBe("resetPose");
    expect(resolveShortcut(key("f"))).toBe("toggleFavorites");
    expect(resolveShortcut(key(" "))).toBe("togglePlayback");
    expect(resolveShortcut(key("h"))).toBe("frameScene");
    expect(resolveShortcut(key("?"))).toBe("help");
    expect(resolveShortcut(key("Delete"))).toBe("delete");
    expect(resolveShortcut(key("Backspace"))).toBe("delete");
  });

  it("ignores unknown keys", () => {
    expect(resolveShortcut(key("q"))).toBeNull();
    expect(resolveShortcut(key("F5"))).toBeNull();
    expect(resolveShortcut(key(""))).toBeNull();
  });

  it("ignores events from text fields", () => {
    for (const tag of ["input", "TEXTAREA", "Select"]) {
      expect(resolveShortcut(field(tag)), tag).toBeNull();
    }
  });

  it("ignores contentEditable elements", () => {
    const editable = {
      key: "r",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      target: { tagName: "div", isContentEditable: true },
    } as unknown as KeyboardEvent;
    expect(resolveShortcut(editable)).toBeNull();
  });

  it("isTextEntry handles null and non-elements", () => {
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry({ tagName: 5 } as unknown as HTMLElement)).toBe(false);
    // A plain div is not text entry, so bare keys still work there.
    expect(isTextEntry(field("div") as unknown as EventTarget)).toBe(false);
  });
});
