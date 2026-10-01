// Undo/redo over scene snapshots.
//
// Scenes are small plain-data objects, so the simplest correct history is a
// stack of snapshots rather than a list of inverse operations. That avoids the
// classic failure where an inverse does not exactly restore the prior state
// and the history slowly drifts away from reality.
//
// Snapshots are cloned on the way in and out, so a later mutation of the live
// scene cannot retroactively alter history.

export interface HistoryOptions {
  limit?: number;
  // Ignore consecutive snapshots that serialise identically, so dragging a
  // slider back to its original value does not create two undo steps.
  dedupe?: boolean;
}

function clone<T>(state: T): T {
  if (typeof structuredClone === "function") return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as T;
}

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private present: T | null = null;
  private readonly limit: number;
  private readonly dedupe: boolean;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 100;
    this.dedupe = options.dedupe ?? true;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoDepth(): number {
    return this.past.length;
  }

  get redoDepth(): number {
    return this.future.length;
  }

  get current(): T | null {
    return this.present;
  }

  /**
   * Record a new state, clearing the redo stack as any new edit does.
   * Call this AFTER the change is applied.
   */
  push(state: T): void {
    const snapshot = clone(state);

    if (
      this.dedupe &&
      this.present !== null &&
      JSON.stringify(this.present) === JSON.stringify(snapshot)
    ) {
      return;
    }

    if (this.present !== null) {
      this.past.push(this.present);
      if (this.past.length > this.limit) this.past.shift();
    }

    this.present = snapshot;
    this.future = [];
  }

  /** Seed the history so the first edit can be undone back to it. */
  initial(state: T): void {
    this.past = [];
    this.future = [];
    this.present = clone(state);
  }

  /** Step back, returning the restored state, or null when there is nothing. */
  undo(): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    if (this.present !== null) this.future.push(this.present);
    this.present = previous;
    return clone(previous);
  }

  /** Step forward, returning the restored state, or null when there is nothing. */
  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    if (this.present !== null) this.past.push(this.present);
    this.present = next;
    return clone(next);
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.present = null;
  }
}

export type HistoryAction = "undo" | "redo" | null;

/**
 * Whether a keyboard event should trigger undo or redo.
 *
 * Text inputs are excluded so undo inside a field still edits text instead of
 * destroying the scene.
 */
export function historyShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target?: unknown;
}): HistoryAction {
  if (event.key.toLowerCase() !== "z") return null;
  if (!event.metaKey && !event.ctrlKey) return null;
  if (isTextEntry(event.target)) return null;
  return event.shiftKey ? "redo" : "undo";
}

function isTextEntry(target: unknown): boolean {
  const el = target as
    | { tagName?: string; isContentEditable?: boolean; type?: string }
    | null
    | undefined;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    // Range, checkbox, radio and button inputs hold no undoable text.
    return !["range", "checkbox", "radio", "button"].includes(el.type ?? "");
  }
  return false;
}
