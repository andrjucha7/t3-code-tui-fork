import { type CreateProjectInput, createProject } from "@t3tools/client-runtime/operations";
import { createEnvironmentCommand } from "@t3tools/client-runtime/state/runtime";
import { createServerEnvironmentAtoms } from "@t3tools/client-runtime/state/server";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import {
  createEnvironmentShellAtoms,
  createEnvironmentSnapshotAtom,
} from "@t3tools/client-runtime/state/shell";
import {
  createEnvironmentThreadDetailAtoms,
  createEnvironmentThreadStateAtoms,
  createThreadEnvironmentAtoms,
} from "@t3tools/client-runtime/state/threads";

import type { ConnectionAtomRuntime } from "../connection/connectionRuntime.ts";

/**
 * The same client-runtime atoms the web and mobile apps use, built against the
 * TUI's connection runtime. One instance per session, because the runtime is.
 */
export function makeTuiState(runtime: ConnectionAtomRuntime) {
  const environmentShell = createEnvironmentShellAtoms(runtime);
  const environmentSnapshotAtom = createEnvironmentSnapshotAtom(environmentShell.stateAtom);
  const threadEnvironment = createThreadEnvironmentAtoms(runtime, environmentSnapshotAtom);
  const environmentThreads = createEnvironmentThreadStateAtoms(runtime);
  const environmentThreadDetails = createEnvironmentThreadDetailAtoms(environmentThreads.stateAtom);
  const environmentSession = createEnvironmentSessionAtoms(runtime);
  const serverEnvironment = createServerEnvironmentAtoms(runtime, {
    initialConfigValueAtom: environmentSession.initialConfigValueAtom,
    usageLimitSources: true,
    usageLimitsCommand: true,
  });

  // Only project creation; the web's project atoms also carry file browsing the TUI has no use for.
  const createProjectCommand = createEnvironmentCommand(runtime, {
    label: "environment-data:commands:project:create",
    execute: (input: CreateProjectInput) => createProject(input),
  });

  return {
    environmentShell,
    createProject: createProjectCommand,
    threadEnvironment,
    environmentThreadDetails,
    serverEnvironment,
  };
}

export type TuiState = ReturnType<typeof makeTuiState>;
