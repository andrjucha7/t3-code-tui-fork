import type { OrchestrationV2TurnItem } from "@t3tools/contracts";

export interface Line {
  readonly text: string;
  readonly color?: string;
  readonly dim?: boolean;
  readonly bold?: boolean;
}

const COMMAND_OUTPUT_LINES = 12;

/** Hard-wraps text to `width` columns, keeping existing line breaks. */
export function wrap(text: string, width: number): string[] {
  const max = Math.max(1, width);
  const out: string[] = [];
  for (const raw of text.replace(/\t/g, "  ").split("\n")) {
    if (raw.length === 0) {
      out.push("");
      continue;
    }
    let rest = raw;
    while (rest.length > max) {
      const space = rest.lastIndexOf(" ", max);
      const cut = space > max / 2 ? space : max;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ /, "");
    }
    out.push(rest);
  }
  return out;
}

function block(
  lines: Line[],
  text: string,
  width: number,
  style: Omit<Line, "text"> = {},
  indent = "",
) {
  for (const row of wrap(text, width - indent.length)) {
    lines.push({ ...style, text: indent + row });
  }
}

function tail(text: string, count: number): { text: string; omitted: number } {
  const rows = text.replace(/\s+$/, "").split("\n");
  if (rows.length <= count) return { text: rows.join("\n"), omitted: 0 };
  return { text: rows.slice(-count).join("\n"), omitted: rows.length - count };
}

/** Renders one turn item as terminal lines. Unknown item kinds render nothing. */
export function renderTurnItem(item: OrchestrationV2TurnItem, width: number): Line[] {
  const lines: Line[] = [];
  switch (item.type) {
    case "user_message":
      lines.push({ text: "› You", color: "cyan", bold: true });
      block(lines, item.text, width, {}, "  ");
      break;
    case "assistant_message":
      lines.push({
        text: item.streaming ? "● Assistant …" : "● Assistant",
        color: "green",
        bold: true,
      });
      block(lines, item.text, width, {}, "  ");
      break;
    case "reasoning":
      block(lines, `∴ ${item.text.trim() || "Thinking…"}`, width, { dim: true });
      break;
    case "proposed_plan":
      lines.push({ text: "▤ Proposed plan", color: "magenta", bold: true });
      block(lines, item.markdown, width, {}, "  ");
      break;
    case "todo_list":
      lines.push({ text: "☰ Plan", color: "magenta", bold: true });
      for (const step of item.steps) {
        const mark = step.status === "completed" ? "✓" : step.status === "running" ? "▸" : "○";
        block(
          lines,
          `${mark} ${step.text}`,
          width,
          step.status === "completed" ? { dim: true } : {},
          "  ",
        );
      }
      break;
    case "command_execution": {
      const failed = item.outputIndicatesFailure === true || (item.exitCode ?? 0) !== 0;
      block(lines, `$ ${item.input}`, width, { color: failed ? "red" : "yellow" });
      if (item.output !== undefined && item.output.trim().length > 0) {
        const shown = tail(item.output, COMMAND_OUTPUT_LINES);
        if (shown.omitted > 0) lines.push({ text: `  … ${shown.omitted} more lines`, dim: true });
        block(lines, shown.text, width, { dim: true }, "  ");
      }
      if (item.exitCode !== undefined && item.exitCode !== 0) {
        lines.push({ text: `  exit ${item.exitCode}`, color: "red" });
      }
      break;
    }
    case "file_change": {
      const stats = [
        item.additions !== undefined ? `+${item.additions}` : null,
        item.deletions !== undefined ? `-${item.deletions}` : null,
      ]
        .filter((part) => part !== null)
        .join(" ");
      block(lines, `✎ ${item.fileName}${stats ? `  ${stats}` : ""}`, width, { color: "blue" });
      break;
    }
    case "file_search":
      block(
        lines,
        `⌕ Searched files${item.pattern ? `: ${item.pattern}` : ""}${item.results ? ` (${item.results.length})` : ""}`,
        width,
        { dim: true },
      );
      break;
    case "web_search":
      block(lines, `⌕ Web search${item.patterns ? `: ${item.patterns.join(", ")}` : ""}`, width, {
        dim: true,
      });
      break;
    case "approval_request":
      block(lines, `? Approval requested: ${item.prompt ?? item.requestKind}`, width, {
        color: "yellow",
      });
      break;
    case "user_input_request":
      for (const question of item.questions) {
        block(lines, `? ${question.question}`, width, { color: "yellow" });
      }
      break;
    case "notification":
      block(lines, `◆ ${item.summary}`, width, {
        dim: item.outcome !== "failed",
        ...(item.outcome === "failed" ? { color: "red" } : {}),
      });
      break;
    case "system_notice":
    case "run_interrupt_request":
    case "run_interrupt_result":
      block(lines, `· ${item.message}`, width, { dim: true });
      break;
    case "error":
      block(lines, `✗ ${item.failure.message}`, width, { color: "red" });
      if (item.retry) {
        lines.push({
          text: `  retry ${item.retry.attempt}${item.retry.maxAttempts ? `/${item.retry.maxAttempts}` : ""}`,
          dim: true,
        });
      }
      break;
    case "compaction":
      lines.push({ text: "· Context compacted", dim: true });
      break;
    case "handoff":
      block(lines, `⇄ Handed off to ${item.toModel ?? item.toProviderInstanceId}`, width, {
        dim: true,
      });
      break;
    case "checkpoint":
      lines.push({ text: `· Checkpoint (${item.files.length} files)`, dim: true });
      break;
    default:
      break;
  }
  return lines;
}

export function renderTranscript(
  items: ReadonlyArray<OrchestrationV2TurnItem>,
  width: number,
): Line[] {
  const lines: Line[] = [];
  for (const item of items) {
    const rendered = renderTurnItem(item, width);
    if (rendered.length === 0) continue;
    if (lines.length > 0) lines.push({ text: "" });
    lines.push(...rendered);
  }
  return lines;
}
