import type {
  ThreadPendingApproval,
  ThreadPendingUserInput,
} from "@t3tools/client-runtime/state/thread-requests";
import { Box, Text } from "ink";
import { createElement as h, type ReactNode } from "react";

import type { EditorState } from "./editor.ts";
import type { ApprovalChoice } from "./model.ts";
import { type Line, wrap } from "./transcript.ts";

export const BORDER = "gray";
export const ACCENT = "cyan";

function Row(props: { readonly line: Line; readonly width: number }) {
  return h(
    Text,
    {
      wrap: "truncate-end",
      ...(props.line.color ? { color: props.line.color } : {}),
      dimColor: props.line.dim === true,
      bold: props.line.bold === true,
    },
    props.line.text.length > 0 ? props.line.text.slice(0, props.width) : " ",
  );
}

export function Pane(props: {
  readonly title: string;
  readonly focused: boolean;
  readonly width?: number;
  readonly height: number;
  readonly children?: ReactNode;
  readonly grow?: boolean;
}) {
  return h(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: props.focused ? ACCENT : BORDER,
      height: props.height,
      ...(props.width !== undefined ? { width: props.width } : {}),
      ...(props.grow ? { flexGrow: 1 } : {}),
      overflow: "hidden",
    },
    h(
      Text,
      { bold: true, color: props.focused ? ACCENT : "white", wrap: "truncate-end" },
      ` ${props.title}`,
    ),
    props.children,
  );
}

export interface SidebarRow {
  readonly key: string;
  readonly label: string;
  readonly kind: "project" | "thread";
  readonly marker?: { readonly text: string; readonly color: string };
  readonly active: boolean;
}

/** Keeps `cursor` on screen and returns the visible slice of `rows`. */
export function windowAround<T>(rows: ReadonlyArray<T>, cursor: number, height: number) {
  const size = Math.max(1, height);
  const start = Math.max(0, Math.min(cursor - Math.floor(size / 2), rows.length - size));
  return { start, rows: rows.slice(start, start + size) };
}

export function Sidebar(props: {
  readonly rows: ReadonlyArray<SidebarRow>;
  readonly cursor: number;
  readonly focused: boolean;
  readonly width: number;
  readonly height: number;
}) {
  const inner = props.height - 3;
  const view = windowAround(props.rows, props.cursor, inner);
  return h(
    Pane,
    { title: "EXPLORER", focused: props.focused, width: props.width, height: props.height },
    props.rows.length === 0
      ? h(Text, { dimColor: true }, " No projects yet")
      : view.rows.map((row, index) => {
          const selected = view.start + index === props.cursor;
          const prefix = row.kind === "project" ? "▾ " : "   ";
          const label = `${prefix}${row.label}`;
          return h(
            Box,
            { key: row.key },
            h(
              Text,
              {
                wrap: "truncate-end",
                bold: row.kind === "project" || row.active,
                ...(selected && props.focused
                  ? { inverse: true }
                  : row.active
                    ? { color: ACCENT }
                    : {}),
              },
              label.slice(0, props.width - 5),
            ),
            row.marker ? h(Text, { color: row.marker.color }, ` ${row.marker.text}`) : null,
          );
        }),
  );
}

export function Transcript(props: {
  readonly title: string;
  readonly lines: ReadonlyArray<Line>;
  readonly scrollFromBottom: number;
  readonly focused: boolean;
  readonly width: number;
  readonly height: number;
  readonly empty: string;
}) {
  const inner = Math.max(1, props.height - 3);
  const end = Math.max(0, props.lines.length - props.scrollFromBottom);
  const visible = props.lines.slice(Math.max(0, end - inner), end);
  const hidden = props.lines.length - end;
  return h(
    Pane,
    {
      title: hidden > 0 ? `${props.title}  (↓ ${hidden} more lines)` : props.title,
      focused: props.focused,
      height: props.height,
      grow: true,
    },
    props.lines.length === 0
      ? h(Text, { dimColor: true }, ` ${props.empty}`)
      : visible.map((line, index) =>
          h(Row, { key: index, line: { ...line, text: ` ${line.text}` }, width: props.width - 2 }),
        ),
  );
}

/** Splits the draft around the cursor cell so it can be drawn inverted. */
function splitAtCursor(editor: EditorState) {
  const at = editor.value[editor.cursor];
  return {
    before: editor.value.slice(0, editor.cursor),
    // A cursor on a newline or past the end draws as a blank cell.
    at: at === undefined || at === "\n" ? " " : at,
    realChar: at !== undefined && at !== "\n",
    after: editor.value.slice(at === undefined || at === "\n" ? editor.cursor : editor.cursor + 1),
  };
}

export function Composer(props: {
  readonly editor: EditorState;
  readonly focused: boolean;
  readonly placeholder: string;
  readonly hint: string;
  readonly height: number;
}) {
  const { before, at, realChar, after } = splitAtCursor(props.editor);
  const showPlaceholder = props.editor.value.length === 0;
  return h(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: props.focused ? ACCENT : BORDER,
      height: props.height,
      overflow: "hidden",
    },
    h(
      Box,
      { flexGrow: 1 },
      h(
        Text,
        { wrap: "wrap" },
        h(Text, { color: ACCENT }, "› "),
        showPlaceholder
          ? h(
              Text,
              {},
              props.focused ? h(Text, { inverse: true }, " ") : null,
              h(Text, { dimColor: true }, props.placeholder),
            )
          : h(
              Text,
              {},
              before,
              props.focused ? h(Text, { inverse: true }, at) : realChar ? at : "",
              after,
            ),
      ),
    ),
    h(Text, { dimColor: true, wrap: "truncate-end" }, props.hint),
  );
}

export function composerHeight(editor: EditorState, width: number): number {
  const rows = wrap(`› ${editor.value} `, Math.max(10, width - 4)).length;
  return Math.min(8, Math.max(1, rows)) + 3;
}

export interface StatusSegment {
  readonly text: string;
  readonly color?: string;
}

export function StatusBar(props: {
  readonly left: ReadonlyArray<StatusSegment>;
  readonly right: ReadonlyArray<StatusSegment>;
  readonly width: number;
}) {
  return h(
    Box,
    { width: props.width, height: 1, justifyContent: "space-between" },
    h(
      Text,
      { wrap: "truncate-end" },
      ...props.left.map((segment, index) =>
        h(
          Text,
          { key: index, ...(segment.color ? { color: segment.color } : {}) },
          ` ${segment.text} `,
        ),
      ),
    ),
    h(
      Text,
      { wrap: "truncate-start" },
      ...props.right.map((segment, index) =>
        h(
          Text,
          {
            key: index,
            dimColor: segment.color === undefined,
            ...(segment.color ? { color: segment.color } : {}),
          },
          ` ${segment.text} `,
        ),
      ),
    ),
  );
}

export interface PaletteItem {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly run: () => void;
}

export function filterPaletteItems(items: ReadonlyArray<PaletteItem>, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((item) => {
    const haystack = `${item.label} ${item.hint ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function Palette(props: {
  readonly title: string;
  readonly query: string;
  readonly items: ReadonlyArray<PaletteItem>;
  readonly cursor: number;
  readonly width: number;
  readonly maxRows: number;
}) {
  const view = windowAround(props.items, props.cursor, props.maxRows);
  return h(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: ACCENT,
      width: props.width,
      paddingX: 1,
    },
    h(Text, { bold: true, color: ACCENT }, props.title),
    h(Text, {}, h(Text, { color: ACCENT }, "> "), props.query, h(Text, { inverse: true }, " ")),
    props.items.length === 0
      ? h(Text, { dimColor: true }, "No matches")
      : view.rows.map((item, index) => {
          const selected = view.start + index === props.cursor;
          return h(
            Box,
            { key: item.id, justifyContent: "space-between" },
            h(
              Text,
              { wrap: "truncate-end", ...(selected ? { inverse: true } : {}) },
              ` ${item.label} `,
            ),
            item.hint ? h(Text, { dimColor: true, wrap: "truncate-end" }, item.hint) : null,
          );
        }),
    h(Text, { dimColor: true }, "↑↓ select · enter run · esc close"),
  );
}

export function ApprovalPanel(props: {
  readonly approval: ThreadPendingApproval;
  readonly choices: ReadonlyArray<ApprovalChoice>;
  readonly more: number;
}) {
  return h(
    Box,
    { flexDirection: "column", borderStyle: "double", borderColor: "yellow", paddingX: 1 },
    h(
      Text,
      { bold: true, color: "yellow" },
      `Approval needed: ${props.approval.requestKind}${props.more > 0 ? `  (+${props.more} more)` : ""}`,
    ),
    props.approval.detail
      ? h(Text, { wrap: "truncate-end" }, props.approval.detail.split("\n").slice(0, 6).join("\n"))
      : null,
    props.approval.responseCapability === "not_resumable"
      ? h(Text, { color: "red" }, "This request can no longer be answered.")
      : h(
          Text,
          {},
          ...props.choices.map((choice, index) =>
            h(
              Text,
              { key: choice.decision },
              h(Text, { color: ACCENT, bold: true }, `[${index + 1}] `),
              `${choice.label}   `,
            ),
          ),
        ),
  );
}

export function UserInputPanel(props: {
  readonly request: ThreadPendingUserInput;
  readonly questionIndex: number;
  readonly selected: ReadonlyArray<string>;
  readonly editor: EditorState;
}) {
  const question = props.request.questions[props.questionIndex];
  if (!question) return null;
  return h(
    Box,
    { flexDirection: "column", borderStyle: "double", borderColor: "yellow", paddingX: 1 },
    h(
      Text,
      { bold: true, color: "yellow" },
      `${question.header}  (${props.questionIndex + 1}/${props.request.questions.length})`,
    ),
    h(Text, {}, question.question),
    ...question.options.map((option, index) => {
      const value = option.value ?? option.label;
      const checked = props.selected.includes(value);
      return h(
        Text,
        { key: value, wrap: "truncate-end" },
        h(Text, { color: ACCENT, bold: true }, `[${index + 1}] `),
        question.multiSelect ? (checked ? "◉ " : "○ ") : "",
        h(Text, { bold: true }, option.label),
        h(Text, { dimColor: true }, ` — ${option.description}`),
      );
    }),
    question.allowCustomAnswer === false
      ? null
      : h(
          Text,
          {},
          h(Text, { dimColor: true }, "Answer: "),
          props.editor.value,
          h(Text, { inverse: true }, " "),
        ),
    h(
      Text,
      { dimColor: true },
      [
        question.multiSelect ? "number toggles · enter confirms" : "number picks",
        question.allowCustomAnswer === false ? null : "type to answer",
        props.request.dismissible ? "esc dismiss" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    ),
  );
}
