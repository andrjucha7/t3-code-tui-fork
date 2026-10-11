import type { Key } from "ink";
import { describe, expect, it } from "vite-plus/test";

import { applyEditorKey, EMPTY_EDITOR } from "./editor.ts";

const NO_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
};

describe("applyEditorKey", () => {
  it("inserts typed text at the cursor", () => {
    const result = applyEditorKey({ value: "ac", cursor: 1 }, "b", NO_KEY);
    expect(result).toEqual({ type: "edit", state: { value: "abc", cursor: 2 } });
  });

  it("submits on enter", () => {
    const result = applyEditorKey({ value: "hi", cursor: 2 }, "", { ...NO_KEY, return: true });
    expect(result).toEqual({ type: "submit", value: "hi" });
  });

  it("turns a trailing backslash plus enter into a newline", () => {
    const result = applyEditorKey({ value: "a\\", cursor: 2 }, "", { ...NO_KEY, return: true });
    expect(result).toEqual({ type: "edit", state: { value: "a\n", cursor: 2 } });
  });

  it("deletes the previous word with ctrl+w", () => {
    const result = applyEditorKey({ value: "one two", cursor: 7 }, "w", { ...NO_KEY, ctrl: true });
    expect(result).toEqual({ type: "edit", state: { value: "one ", cursor: 4 } });
  });

  it("ignores backspace at the start", () => {
    expect(applyEditorKey(EMPTY_EDITOR, "", { ...NO_KEY, backspace: true })).toEqual({
      type: "ignored",
    });
  });
});
