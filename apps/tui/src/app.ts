import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { deriveThreadTitleSeed } from "@t3tools/client-runtime/operations";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import type {
  PendingThreadRequests,
  ThreadPendingUserInput,
} from "@t3tools/client-runtime/state/thread-requests";
import {
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ProjectId,
  ThreadId,
  type ModelSelection,
  type OrchestrationV2ThreadProjection,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity";
import { Box, useApp, useInput, useWindowSize, type Key } from "ink";
import { createElement as h, useContext, useEffect, useMemo, useState } from "react";

import type { TuiSession } from "./connection/session.ts";
import { newUuid } from "./ids.ts";
import type { TuiState } from "./state/atoms.ts";
import {
  ACCENT,
  ApprovalPanel,
  Composer,
  composerHeight,
  filterPaletteItems,
  Palette,
  Sidebar,
  StatusBar,
  Transcript,
  UserInputPanel,
  type PaletteItem,
  type StatusSegment,
} from "./ui/components.ts";
import { applyEditorKey, EMPTY_EDITOR, type EditorState } from "./ui/editor.ts";
import {
  approvalChoices,
  buildSidebar,
  defaultModelSelection,
  describeModel,
  isThreadBusy,
  listModelChoices,
  RUNTIME_MODES,
  toggleAnswer,
  type Selection,
} from "./ui/model.ts";
import { renderTranscript } from "./ui/transcript.ts";

type TurnItems = OrchestrationV2ThreadProjection["visibleTurnItems"];

const EMPTY_TURN_ITEMS_ATOM: Atom.Atom<TurnItems> = Atom.make<TurnItems>([]);
const NO_PENDING_REQUESTS_ATOM: Atom.Atom<PendingThreadRequests | null> =
  Atom.make<PendingThreadRequests | null>(null);

const SIDEBAR_WIDTH = 32;

interface Command<W, A, E> {
  readonly run: (
    registry: AtomRegistry.AtomRegistry,
    input: W,
  ) => Promise<AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>>;
}

interface PaletteState {
  readonly title: string;
  readonly items: ReadonlyArray<PaletteItem>;
  readonly query: string;
  readonly cursor: number;
}

interface UserInputDraft {
  readonly requestId: string;
  readonly questionIndex: number;
  readonly selected: ReadonlyArray<string>;
  readonly answers: Readonly<Record<string, string | ReadonlyArray<string>>>;
  readonly editor: EditorState;
}

interface Status {
  readonly text: string;
  readonly color?: string;
}

function describeFailure(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function freshUserInputDraft(request: ThreadPendingUserInput): UserInputDraft {
  return {
    requestId: request.requestId,
    questionIndex: 0,
    selected: [],
    answers: {},
    editor: EMPTY_EDITOR,
  };
}

export interface AppProps {
  readonly session: TuiSession;
  readonly state: TuiState;
  readonly openGui: () => Promise<void>;
  /** Directory offered by "Add project". */
  readonly cwd: string;
}

export function App(props: AppProps) {
  const { session, state } = props;
  const environmentId = session.environmentId;
  const registry = useContext(RegistryContext);
  const app = useApp();
  const { columns, rows } = useWindowSize();

  const snapshot = useAtomValue(state.threadEnvironment.snapshotAtom(environmentId));
  const shell = useAtomValue(state.environmentShell.stateValueAtom(environmentId));
  const config = useAtomValue(state.serverEnvironment.configValueAtom(environmentId));
  const providers = config?.providers;

  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [focus, setFocus] = useState<"sidebar" | "composer">("sidebar");
  const [sidebarCursor, setSidebarCursor] = useState(0);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [scrollFromBottom, setScrollFromBottom] = useState(0);
  const [palette, setPalette] = useState<PaletteState | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [draftModel, setDraftModel] = useState<ModelSelection | null>(null);
  const [draftRuntimeMode, setDraftRuntimeMode] = useState<RuntimeMode>(DEFAULT_RUNTIME_MODE);
  const [draftInteractionMode, setDraftInteractionMode] =
    useState<ProviderInteractionMode>("default");
  const [userInputDraft, setUserInputDraft] = useState<UserInputDraft | null>(null);

  const sidebar = useMemo(() => buildSidebar(snapshot, selection), [snapshot, selection]);
  const thread =
    selection.kind === "thread"
      ? (snapshot?.threads.find((candidate) => candidate.id === selection.threadId) ?? null)
      : null;
  const projectId = selection.kind === "draft" ? selection.projectId : thread?.projectId;
  const project = snapshot?.projects.find((candidate) => candidate.id === projectId);

  const threadRef =
    selection.kind === "thread" ? { environmentId, threadId: selection.threadId } : null;
  const turnItems = useAtomValue(
    threadRef
      ? state.environmentThreadDetails.visibleTurnItemsAtom(threadRef)
      : EMPTY_TURN_ITEMS_ATOM,
  );
  const pending = useAtomValue(
    threadRef
      ? state.environmentThreadDetails.pendingRequestsAtom(threadRef)
      : NO_PENDING_REQUESTS_ATOM,
  );
  const approval = pending?.approvals[0];
  const userInput = approval ? undefined : pending?.userInputs[0];

  const model = thread?.modelSelection ?? draftModel ?? defaultModelSelection(project, providers);
  const runtimeMode = thread?.runtimeMode ?? draftRuntimeMode;
  const interactionMode = thread?.interactionMode ?? draftInteractionMode;
  const busy = thread ? isThreadBusy(thread.status) : false;

  // A new request starts with a clean answer form.
  useEffect(() => {
    if (!userInput) setUserInputDraft(null);
    else if (userInputDraft?.requestId !== userInput.requestId) {
      setUserInputDraft(freshUserInputDraft(userInput));
    }
  }, [userInput, userInputDraft?.requestId]);

  // Follow the newest output when switching threads.
  useEffect(() => setScrollFromBottom(0), [selection]);

  // Keep the sidebar cursor in range as threads come and go.
  useEffect(() => {
    if (sidebarCursor >= sidebar.length && sidebar.length > 0) setSidebarCursor(sidebar.length - 1);
  }, [sidebar.length, sidebarCursor]);

  // Land on the first project once the snapshot arrives.
  useEffect(() => {
    if (selection.kind === "none" && sidebar[0]) setSelection(sidebar[0].selection);
  }, [selection.kind, sidebar]);

  async function run<W, A, E>(label: string, command: Command<W, A, E>, input: W) {
    const result = await command.run(registry, input);
    if (result._tag === "Failure") {
      setStatus({ text: `${label} failed: ${describeFailure(result.cause)}`, color: "red" });
      return false;
    }
    return true;
  }

  const commands = state.threadEnvironment;

  function select(next: Selection) {
    setSelection(next);
    setStatus(null);
    setFocus("composer");
  }

  function newThread(targetProjectId = project?.id) {
    if (!targetProjectId) {
      setStatus({ text: "Add a project first (ctrl+p → Add project).", color: "yellow" });
      return;
    }
    setDraftModel(null);
    select({ kind: "draft", projectId: targetProjectId });
  }

  function setModel(next: ModelSelection) {
    if (thread) {
      void run("Change model", commands.updateMetadata, {
        environmentId,
        input: { threadId: thread.id, modelSelection: next },
      });
    } else {
      setDraftModel(next);
    }
  }

  function setRuntimeMode(next: RuntimeMode) {
    if (thread) {
      void run("Change mode", commands.setRuntimeMode, {
        environmentId,
        input: { threadId: thread.id, runtimeMode: next },
      });
    } else {
      setDraftRuntimeMode(next);
    }
  }

  function togglePlanMode() {
    const next: ProviderInteractionMode = interactionMode === "plan" ? "default" : "plan";
    if (thread) {
      void run("Toggle plan mode", commands.setInteractionMode, {
        environmentId,
        input: { threadId: thread.id, interactionMode: next },
      });
    } else {
      setDraftInteractionMode(next);
    }
  }

  function interrupt() {
    if (!thread || !busy) return;
    void run("Interrupt", commands.interruptTurn, {
      environmentId,
      input: { threadId: thread.id, ...(thread.activeRunId ? { runId: thread.activeRunId } : {}) },
    });
    setStatus({ text: "Interrupting…" });
  }

  async function addProject(workspaceRoot: string) {
    const existing = snapshot?.projects.find(
      (candidate) => candidate.workspaceRoot === workspaceRoot,
    );
    if (existing) return newThread(existing.id);
    const projectId = ProjectId.make(newUuid());
    setStatus({ text: `Adding ${workspaceRoot}…` });
    const ok = await run("Add project", state.createProject, {
      environmentId,
      input: {
        projectId,
        title: inferProjectTitleFromPath(workspaceRoot),
        workspaceRoot,
        createWorkspaceRootIfMissing: false,
        defaultModelSelection: null,
      },
    });
    if (ok) newThread(projectId);
  }

  function openGui() {
    setStatus({ text: "Opening the GUI…" });
    props.openGui().then(
      () => setStatus({ text: "Opened the GUI." }),
      (error: unknown) =>
        setStatus({
          text: `Could not open the GUI: ${error instanceof Error ? error.message : String(error)}`,
          color: "red",
        }),
    );
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const createdAt = new Date().toISOString();
    const message = {
      messageId: MessageId.make(newUuid()),
      role: "user" as const,
      text: trimmed,
      attachments: [],
    };
    if (thread) {
      setEditor(EMPTY_EDITOR);
      setScrollFromBottom(0);
      const ok = await run("Send", commands.startTurn, {
        environmentId,
        input: {
          creationSource: "web",
          threadId: thread.id,
          message,
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
          createdAt,
        },
      });
      if (!ok) setEditor({ value: text, cursor: text.length });
      return;
    }
    if (!project) {
      setStatus({ text: "Pick a project in the explorer first.", color: "yellow" });
      return;
    }
    if (!model) {
      setStatus({ text: "No provider is ready. Pick a model with ctrl+p.", color: "yellow" });
      return;
    }
    const threadId = ThreadId.make(newUuid());
    const title = deriveThreadTitleSeed({ text: trimmed, attachments: [] });
    setEditor(EMPTY_EDITOR);
    setSelection({ kind: "thread", threadId });
    const ok = await run("Start thread", commands.startTurn, {
      environmentId,
      input: {
        creationSource: "web",
        threadId,
        message,
        modelSelection: model,
        titleSeed: title,
        runtimeMode,
        interactionMode,
        bootstrap: {
          createThread: {
            projectId: project.id,
            title,
            modelSelection: model,
            runtimeMode,
            interactionMode,
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      },
    });
    if (!ok) {
      setSelection({ kind: "draft", projectId: project.id });
      setEditor({ value: text, cursor: text.length });
    }
  }

  function openPalette(title: string, items: ReadonlyArray<PaletteItem>) {
    setPalette({ title, items, query: "", cursor: 0 });
  }

  function openModelPicker() {
    const choices = listModelChoices(providers);
    if (choices.length === 0) {
      setStatus({
        text: "No enabled providers. Configure them in the GUI settings.",
        color: "yellow",
      });
      return;
    }
    openPalette(
      "Model",
      choices.map((choice) => ({
        id: `${choice.selection.instanceId}/${choice.selection.model}`,
        label: choice.modelLabel,
        hint: choice.providerLabel,
        run: () => setModel(choice.selection),
      })),
    );
  }

  function openThreadPicker() {
    openPalette(
      "Go to thread",
      (snapshot?.threads ?? []).map((candidate) => ({
        id: candidate.id,
        label: candidate.title,
        hint: snapshot?.projects.find((p) => p.id === candidate.projectId)?.title ?? "",
        run: () => select({ kind: "thread", threadId: candidate.id }),
      })),
    );
  }

  function openProjectPicker() {
    openPalette(
      "New thread in project",
      (snapshot?.projects ?? []).map((candidate) => ({
        id: candidate.id,
        label: candidate.title,
        hint: candidate.workspaceRoot,
        run: () => newThread(candidate.id),
      })),
    );
  }

  function openCommandPalette() {
    const items: PaletteItem[] = [
      { id: "new", label: "New thread", hint: "ctrl+n", run: () => newThread() },
      { id: "new-in", label: "New thread in project…", run: openProjectPicker },
      { id: "goto", label: "Go to thread…", run: openThreadPicker },
      {
        id: "model",
        label: "Change model…",
        hint: describeModel(model, providers),
        run: openModelPicker,
      },
      {
        id: "mode",
        label: "Change approval mode…",
        hint: runtimeMode,
        run: () =>
          openPalette(
            "Approval mode",
            RUNTIME_MODES.map((entry) => ({
              id: entry.mode,
              label: entry.label,
              hint: entry.mode === runtimeMode ? "current" : entry.mode,
              run: () => setRuntimeMode(entry.mode),
            })),
          ),
      },
      {
        id: "plan",
        label: interactionMode === "plan" ? "Leave plan mode" : "Enter plan mode",
        hint: "shift+tab",
        run: togglePlanMode,
      },
      {
        id: "sidebar",
        label: "Toggle explorer",
        hint: "ctrl+b",
        run: () => setSidebarVisible((v) => !v),
      },
      {
        id: "add-project",
        label: "Add project (current directory)",
        hint: props.cwd,
        run: () => void addProject(props.cwd),
      },
      { id: "gui", label: "Open in GUI", hint: "ctrl+o", run: openGui },
      { id: "quit", label: "Quit", hint: "ctrl+c", run: () => app.exit() },
    ];
    if (thread) {
      if (busy)
        items.splice(3, 0, {
          id: "interrupt",
          label: "Interrupt turn",
          hint: "esc",
          run: interrupt,
        });
      items.push(
        {
          id: "stop",
          label: "Stop provider session",
          run: () =>
            void run("Stop session", commands.stopSession, {
              environmentId,
              input: { threadId: thread.id },
            }),
        },
        {
          id: "archive",
          label: "Archive thread",
          run: () => {
            void run("Archive", commands.archive, {
              environmentId,
              input: { threadId: thread.id },
            });
            select({ kind: "draft", projectId: thread.projectId });
          },
        },
      );
    }
    openPalette("Commands", items);
  }

  function handlePaletteKey(current: PaletteState, input: string, key: Key) {
    const visible = filterPaletteItems(current.items, current.query);
    if (key.escape) return setPalette(null);
    if (key.return) {
      const item = visible[current.cursor];
      setPalette(null);
      item?.run();
      return;
    }
    if (key.upArrow) return setPalette({ ...current, cursor: Math.max(0, current.cursor - 1) });
    if (key.downArrow) {
      return setPalette({ ...current, cursor: Math.min(visible.length - 1, current.cursor + 1) });
    }
    if (key.backspace || key.delete) {
      return setPalette({ ...current, query: current.query.slice(0, -1), cursor: 0 });
    }
    if (!key.ctrl && !key.meta && input.length > 0) {
      setPalette({ ...current, query: current.query + input, cursor: 0 });
    }
  }

  function answerUserInput(
    request: ThreadPendingUserInput,
    draft: UserInputDraft,
    answer: string | ReadonlyArray<string>,
  ) {
    const question = request.questions[draft.questionIndex];
    if (!question || !thread) return;
    const answers = { ...draft.answers, [question.id]: answer };
    if (draft.questionIndex + 1 < request.questions.length) {
      setUserInputDraft({
        ...draft,
        questionIndex: draft.questionIndex + 1,
        selected: [],
        answers,
        editor: EMPTY_EDITOR,
      });
      return;
    }
    setUserInputDraft(null);
    void run("Answer", commands.respondToUserInput, {
      environmentId,
      input: {
        threadId: thread.id,
        requestId: request.requestId,
        answers: Object.fromEntries(
          Object.entries(answers).map(([id, value]) => [
            id,
            typeof value === "string" ? value : [...value],
          ]),
        ),
      },
    });
  }

  function handleUserInputKey(
    request: ThreadPendingUserInput,
    draft: UserInputDraft,
    input: string,
    key: Key,
  ) {
    const question = request.questions[draft.questionIndex];
    if (!question || !thread) return;
    if (key.escape) {
      if (request.dismissible) {
        setUserInputDraft(null);
        void run("Dismiss", commands.dismissUserInput, {
          environmentId,
          input: { threadId: thread.id, requestId: request.requestId },
        });
      }
      return;
    }
    const digit = Number.parseInt(input, 10);
    if (draft.editor.value.length === 0 && !key.ctrl && input.length === 1 && digit >= 1) {
      const option = question.options[digit - 1];
      if (!option) return;
      const value = option.value ?? option.label;
      if (!question.multiSelect) return answerUserInput(request, draft, value);
      setUserInputDraft({ ...draft, selected: toggleAnswer(draft.selected, value, true) });
      return;
    }
    if (key.return && draft.editor.value.trim().length === 0) {
      if (question.multiSelect && draft.selected.length > 0)
        answerUserInput(request, draft, draft.selected);
      return;
    }
    if (question.allowCustomAnswer === false) return;
    const action = applyEditorKey(draft.editor, input, key);
    if (action.type === "edit") setUserInputDraft({ ...draft, editor: action.state });
    else if (action.type === "submit") answerUserInput(request, draft, action.value.trim());
  }

  function handleSidebarKey(input: string, key: Key) {
    if (key.upArrow || input === "k") return setSidebarCursor((c) => Math.max(0, c - 1));
    if (key.downArrow || input === "j") {
      return setSidebarCursor((c) => Math.min(sidebar.length - 1, c + 1));
    }
    const entry = sidebar[sidebarCursor];
    if (!entry) return;
    if (key.return) return select(entry.selection);
    if (input === "n") {
      const target =
        entry.selection.kind === "draft"
          ? entry.selection.projectId
          : snapshot?.threads.find(
              (t) => entry.selection.kind === "thread" && t.id === entry.selection.threadId,
            )?.projectId;
      return newThread(target);
    }
  }

  useInput((input, key) => {
    if (palette) return handlePaletteKey(palette, input, key);

    if (key.ctrl && input === "c") {
      if (focus === "composer" && editor.value.length > 0) return setEditor(EMPTY_EDITOR);
      return app.exit();
    }
    if (key.ctrl && input === "p") return openCommandPalette();
    if (key.ctrl && input === "n") return newThread();
    if (key.ctrl && input === "b") return setSidebarVisible((v) => !v);
    if (key.ctrl && input === "o") return openGui();
    if (key.ctrl && input === "t") return openModelPicker();
    if (key.ctrl && input === "g") return openThreadPicker();
    if (key.tab && key.shift) return togglePlanMode();
    if (key.tab) {
      if (!sidebarVisible) return;
      return setFocus((f) => (f === "sidebar" ? "composer" : "sidebar"));
    }
    if (key.pageUp) return setScrollFromBottom((s) => s + Math.max(1, rows - 12));
    if (key.pageDown) return setScrollFromBottom((s) => Math.max(0, s - Math.max(1, rows - 12)));

    if (focus === "sidebar" && sidebarVisible) return handleSidebarKey(input, key);

    if (approval && thread && approval.responseCapability === "live") {
      const choices = approvalChoices(approval);
      const choice = choices[Number.parseInt(input, 10) - 1];
      if (choice) {
        void run("Approval", commands.respondToApproval, {
          environmentId,
          input: { threadId: thread.id, requestId: approval.requestId, decision: choice.decision },
        });
        return;
      }
    }
    if (userInput && userInputDraft?.requestId === userInput.requestId) {
      return handleUserInputKey(userInput, userInputDraft, input, key);
    }

    if (key.escape) {
      if (busy) return interrupt();
      if (sidebarVisible) setFocus("sidebar");
      return;
    }
    if (editor.value.length === 0 && (key.upArrow || key.downArrow)) {
      return setScrollFromBottom((s) => Math.max(0, s + (key.upArrow ? 1 : -1)));
    }
    const action = applyEditorKey(editor, input, key);
    if (action.type === "edit") setEditor(action.state);
    else if (action.type === "submit") void submit(action.value);
  });

  // ── layout ────────────────────────────────────────────────────────────
  const sidebarWidth = sidebarVisible ? Math.min(SIDEBAR_WIDTH, Math.floor(columns / 3)) : 0;
  const mainWidth = columns - sidebarWidth;
  const bodyHeight = rows - 1;
  const composerRows = composerHeight(editor, mainWidth);
  const panelRows = approval
    ? 4 + Math.min(6, approval.detail?.split("\n").length ?? 0)
    : userInput
      ? 4 + (userInput.questions[userInputDraft?.questionIndex ?? 0]?.options.length ?? 0) + 2
      : 0;
  const transcriptHeight = Math.max(4, bodyHeight - composerRows - panelRows);
  const lines = useMemo(
    () =>
      renderTranscript(
        turnItems.map((entry) => entry.item),
        mainWidth - 4,
      ),
    [turnItems, mainWidth],
  );

  const title =
    thread?.title ??
    (selection.kind === "draft" ? `New thread · ${project?.title ?? ""}` : "T3 Code");
  const emptyText =
    selection.kind === "draft"
      ? "Type a message to start a new thread."
      : shell.status === "empty"
        ? "Connecting…"
        : "Pick a project or thread in the explorer.";

  const left: StatusSegment[] = [
    { text: session.label, color: ACCENT },
    ...(project ? [{ text: project.title }] : []),
    { text: describeModel(model, providers), color: "magenta" },
    { text: runtimeMode },
    ...(interactionMode === "plan" ? [{ text: "PLAN", color: "yellow" }] : []),
    ...(thread && thread.status !== "idle"
      ? [{ text: thread.status, color: busy ? "green" : "gray" }]
      : []),
  ];
  const right: StatusSegment[] = status
    ? [{ text: status.text, ...(status.color ? { color: status.color } : {}) }]
    : thread?.lastError
      ? [{ text: thread.lastError, color: "red" }]
      : [{ text: "ctrl+p commands · ctrl+o GUI · tab focus" }];

  const hint = busy
    ? "esc interrupt · enter queues a follow-up"
    : "enter send · \\+enter newline · shift+tab plan · ctrl+t model";

  const main = h(
    Box,
    { flexDirection: "column", width: mainWidth, height: bodyHeight },
    h(Transcript, {
      title,
      lines,
      scrollFromBottom: Math.min(scrollFromBottom, Math.max(0, lines.length - 1)),
      focused: false,
      width: mainWidth,
      height: transcriptHeight,
      empty: emptyText,
    }),
    approval
      ? h(ApprovalPanel, {
          approval,
          choices: approvalChoices(approval),
          more: (pending?.approvals.length ?? 1) - 1,
        })
      : null,
    userInput && userInputDraft
      ? h(UserInputPanel, {
          request: userInput,
          questionIndex: userInputDraft.questionIndex,
          selected: userInputDraft.selected,
          editor: userInputDraft.editor,
        })
      : null,
    h(Composer, {
      editor,
      focused: focus === "composer" && !palette && !userInput && !approval,
      placeholder: thread ? "Message the agent…" : "Describe a task to start a thread…",
      hint,
      height: composerRows,
    }),
  );

  return h(
    Box,
    { flexDirection: "column", width: columns, height: rows },
    h(
      Box,
      { flexDirection: "row", height: bodyHeight },
      sidebarVisible
        ? h(Sidebar, {
            rows: sidebar.map((entry) => entry.row),
            cursor: sidebarCursor,
            focused: focus === "sidebar" && !palette,
            width: sidebarWidth,
            height: bodyHeight,
          })
        : null,
      main,
    ),
    palette
      ? h(
          Box,
          {
            position: "absolute",
            marginTop: 2,
            marginLeft: Math.max(0, Math.floor((columns - 64) / 2)),
          },
          h(Palette, {
            title: palette.title,
            query: palette.query,
            items: filterPaletteItems(palette.items, palette.query),
            cursor: palette.cursor,
            width: Math.min(64, columns - 2),
            maxRows: Math.min(12, rows - 8),
          }),
        )
      : null,
    h(StatusBar, { left, right, width: columns }),
  );
}
