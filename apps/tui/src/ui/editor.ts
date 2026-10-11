import type { Key } from "ink";

export interface EditorState {
  readonly value: string;
  readonly cursor: number;
}

export const EMPTY_EDITOR: EditorState = { value: "", cursor: 0 };

export type EditorAction =
  | { readonly type: "edit"; readonly state: EditorState }
  | { readonly type: "submit"; readonly value: string }
  | { readonly type: "ignored" };

function insert(state: EditorState, text: string): EditorState {
  return {
    value: state.value.slice(0, state.cursor) + text + state.value.slice(state.cursor),
    cursor: state.cursor + text.length,
  };
}

function lineStart(value: string, cursor: number): number {
  return value.lastIndexOf("\n", cursor - 1) + 1;
}

function lineEnd(value: string, cursor: number): number {
  const end = value.indexOf("\n", cursor);
  return end === -1 ? value.length : end;
}

function previousWord(value: string, cursor: number): number {
  let index = cursor;
  while (index > 0 && /\s/.test(value[index - 1]!)) index--;
  while (index > 0 && !/\s/.test(value[index - 1]!)) index--;
  return index;
}

/**
 * Applies one Ink key event. Enter submits; a trailing backslash before Enter,
 * or ctrl+j, inserts a newline instead.
 */
export function applyEditorKey(state: EditorState, input: string, key: Key): EditorAction {
  const { value, cursor } = state;
  if (key.return) {
    if (cursor > 0 && value[cursor - 1] === "\\") {
      return {
        type: "edit",
        state: { value: value.slice(0, cursor - 1) + "\n" + value.slice(cursor), cursor },
      };
    }
    return { type: "submit", value };
  }
  if (key.ctrl && input === "j") return { type: "edit", state: insert(state, "\n") };
  if (key.leftArrow) return { type: "edit", state: { value, cursor: Math.max(0, cursor - 1) } };
  if (key.rightArrow) {
    return { type: "edit", state: { value, cursor: Math.min(value.length, cursor + 1) } };
  }
  if (key.home || (key.ctrl && input === "a")) {
    return { type: "edit", state: { value, cursor: lineStart(value, cursor) } };
  }
  if (key.end || (key.ctrl && input === "e")) {
    return { type: "edit", state: { value, cursor: lineEnd(value, cursor) } };
  }
  if (key.ctrl && input === "u") {
    const start = lineStart(value, cursor);
    return {
      type: "edit",
      state: { value: value.slice(0, start) + value.slice(cursor), cursor: start },
    };
  }
  if (key.ctrl && input === "w") {
    const start = previousWord(value, cursor);
    return {
      type: "edit",
      state: { value: value.slice(0, start) + value.slice(cursor), cursor: start },
    };
  }
  // Most terminals send DEL for Backspace, which Ink reports as `delete`.
  if (key.backspace || key.delete) {
    if (cursor === 0) return { type: "ignored" };
    return {
      type: "edit",
      state: { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 },
    };
  }
  if (key.ctrl || key.meta || key.escape || key.tab || key.upArrow || key.downArrow) {
    return { type: "ignored" };
  }
  if (input.length === 0) return { type: "ignored" };
  return { type: "edit", state: insert(state, input.replace(/\r\n?/g, "\n")) };
}
