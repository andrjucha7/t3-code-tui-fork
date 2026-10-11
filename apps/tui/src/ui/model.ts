import { resolveProviderInstanceDisplayName } from "@t3tools/client-runtime/state/provider-instance-display";
import type { ThreadPendingApproval } from "@t3tools/client-runtime/state/thread-requests";
import type {
  ModelSelection,
  OrchestrationV2ShellSnapshot,
  ProviderApprovalDecision,
  RuntimeMode,
  ServerProvider,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { SidebarRow } from "./components.ts";

export type ShellThread = OrchestrationV2ShellSnapshot["threads"][number];
export type ShellProject = OrchestrationV2ShellSnapshot["projects"][number];

export type Selection =
  | { readonly kind: "none" }
  | { readonly kind: "draft"; readonly projectId: ShellProject["id"] }
  | { readonly kind: "thread"; readonly threadId: ShellThread["id"] };

export const RUNTIME_MODES: ReadonlyArray<{ readonly mode: RuntimeMode; readonly label: string }> =
  [
    { mode: "approval-required", label: "Ask before changes" },
    { mode: "auto-accept-edits", label: "Auto-accept edits" },
    { mode: "auto", label: "Auto" },
    { mode: "full-access", label: "Full access" },
  ];

const ACTIVE_STATUSES = new Set(["preparing", "queued", "starting", "running", "waiting"]);

export function isThreadBusy(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

function threadMarker(thread: ShellThread): SidebarRow["marker"] {
  if (thread.pendingRuntimeRequest !== null) return { text: "?", color: "yellow" };
  if (isThreadBusy(thread.status)) return { text: "●", color: "green" };
  if (thread.status === "failed") return { text: "✗", color: "red" };
  return undefined;
}

export interface SidebarEntry {
  readonly row: SidebarRow;
  readonly selection: Selection;
}

/** Projects in snapshot order, each followed by its threads, newest first. */
export function buildSidebar(
  snapshot: OrchestrationV2ShellSnapshot | null,
  selection: Selection,
): ReadonlyArray<SidebarEntry> {
  if (snapshot === null) return [];
  const entries: SidebarEntry[] = [];
  for (const project of snapshot.projects) {
    entries.push({
      row: {
        key: `p:${project.id}`,
        label: project.title,
        kind: "project",
        active: selection.kind === "draft" && selection.projectId === project.id,
      },
      selection: { kind: "draft", projectId: project.id },
    });
    const threads = snapshot.threads
      .filter((thread) => thread.projectId === project.id)
      .toSorted(
        (a, b) => DateTime.toEpochMillis(b.updatedAt) - DateTime.toEpochMillis(a.updatedAt),
      );
    for (const thread of threads) {
      const marker = threadMarker(thread);
      entries.push({
        row: {
          key: `t:${thread.id}`,
          label: thread.title,
          kind: "thread",
          active: selection.kind === "thread" && selection.threadId === thread.id,
          ...(marker ? { marker } : {}),
        },
        selection: { kind: "thread", threadId: thread.id },
      });
    }
  }
  return entries;
}

export interface ModelChoice {
  readonly selection: ModelSelection;
  readonly providerLabel: string;
  readonly modelLabel: string;
}

/** Every model of every usable provider instance, Pi included. */
export function listModelChoices(
  providers: ReadonlyArray<ServerProvider> | null | undefined,
): ReadonlyArray<ModelChoice> {
  const choices: ModelChoice[] = [];
  for (const provider of providers ?? []) {
    if (!provider.enabled || !provider.installed) continue;
    const providerLabel = resolveProviderInstanceDisplayName(provider);
    for (const model of provider.models) {
      choices.push({
        selection: { instanceId: provider.instanceId, model: model.slug },
        providerLabel,
        modelLabel: model.name,
      });
    }
  }
  return choices;
}

/** The project's default, else the first default model, else any model. */
export function defaultModelSelection(
  project: ShellProject | undefined,
  providers: ReadonlyArray<ServerProvider> | null | undefined,
): ModelSelection | null {
  if (project?.defaultModelSelection) return project.defaultModelSelection;
  for (const provider of providers ?? []) {
    if (!provider.enabled || !provider.installed) continue;
    const model = provider.models.find((candidate) => candidate.isDefault) ?? provider.models[0];
    if (model) return { instanceId: provider.instanceId, model: model.slug };
  }
  return null;
}

export function describeModel(
  selection: ModelSelection | null | undefined,
  providers: ReadonlyArray<ServerProvider> | null | undefined,
): string {
  if (!selection) return "no model";
  const provider = providers?.find((candidate) => candidate.instanceId === selection.instanceId);
  if (!provider) return selection.model;
  const model = provider.models.find((candidate) => candidate.slug === selection.model);
  return `${resolveProviderInstanceDisplayName(provider)} · ${model?.shortName ?? model?.name ?? selection.model}`;
}

export interface ApprovalChoice {
  readonly label: string;
  readonly decision: ProviderApprovalDecision;
}

const DEFAULT_APPROVAL_CHOICES: ReadonlyArray<ApprovalChoice> = [
  { label: "Allow", decision: "accept" },
  { label: "Allow for session", decision: "acceptForSession" },
  { label: "Deny", decision: "decline" },
];

export function approvalChoices(approval: ThreadPendingApproval): ReadonlyArray<ApprovalChoice> {
  if (!approval.options || approval.options.length === 0) return DEFAULT_APPROVAL_CHOICES;
  return approval.options.map((option) => ({ label: option.label, decision: option.decision }));
}

/** Toggles (multi-select) or replaces (single-select) a picked option value. */
export function toggleAnswer(
  selected: ReadonlyArray<string>,
  value: string,
  multiSelect: boolean,
): ReadonlyArray<string> {
  if (!multiSelect) return [value];
  return selected.includes(value)
    ? selected.filter((entry) => entry !== value)
    : [...selected, value];
}
