import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { defaultModelSelection, listModelChoices, toggleAnswer } from "./model.ts";
import { wrap } from "./transcript.ts";

function provider(overrides: Readonly<Record<string, unknown>>): ServerProvider {
  // Only the fields the TUI reads matter here.
  return {
    instanceId: "pi",
    driver: "pi",
    enabled: true,
    installed: true,
    models: [{ slug: "sonnet", name: "Sonnet", isDefault: true }],
    ...overrides,
  } as unknown as ServerProvider;
}

describe("listModelChoices", () => {
  it("lists models of enabled, installed providers only", () => {
    const choices = listModelChoices([
      provider({ instanceId: "pi", displayName: "Pi" }),
      provider({ instanceId: "codex", enabled: false }),
      provider({ instanceId: "claude", installed: false }),
    ]);
    expect(choices.map((choice) => choice.selection)).toEqual([
      { instanceId: "pi", model: "sonnet" },
    ]);
  });
});

describe("defaultModelSelection", () => {
  it("falls back to the first usable provider's default model", () => {
    expect(
      defaultModelSelection(undefined, [
        provider({ enabled: false }),
        provider({
          instanceId: "pi",
          models: [
            { slug: "a", name: "A" },
            { slug: "b", name: "B", isDefault: true },
          ],
        }),
      ]),
    ).toEqual({ instanceId: "pi", model: "b" });
  });
});

describe("toggleAnswer", () => {
  it("replaces the answer for single-select questions", () => {
    expect(toggleAnswer(["a"], "b", false)).toEqual(["b"]);
  });

  it("toggles answers for multi-select questions", () => {
    expect(toggleAnswer(["a", "b"], "a", true)).toEqual(["b"]);
    expect(toggleAnswer(["b"], "c", true)).toEqual(["b", "c"]);
  });
});

describe("wrap", () => {
  it("breaks long lines at spaces and keeps blank lines", () => {
    expect(wrap("aaa bbb ccc\n\nd", 7)).toEqual(["aaa bbb", "ccc", "", "d"]);
  });
});
