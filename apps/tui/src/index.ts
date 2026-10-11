import { RegistryContext } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import { AtomRegistry } from "effect/reactivity";
import { render } from "ink";
import { createElement as h } from "react";

import { App } from "./app.ts";
import { makeConnectionAtomRuntime } from "./connection/connectionRuntime.ts";
import { openSession } from "./connection/session.ts";
import { makeTuiState } from "./state/atoms.ts";

export { openSession, type TuiSession } from "./connection/session.ts";

export interface RunTuiOptions {
  /** Loopback URL of the running T3 Code server. */
  readonly httpBaseUrl: string;
  /** One-time pairing credential, exchanged for a bearer session. */
  readonly credential: string;
  readonly appVersion?: string;
  /** Brings up the graphical app (desktop window or browser) for the same server. */
  readonly openGui: () => Promise<void>;
}

/** Connects to the server and runs the terminal UI until the user quits. */
export async function run(options: RunTuiOptions): Promise<void> {
  const session = await Effect.runPromise(
    openSession({
      httpBaseUrl: options.httpBaseUrl,
      credential: options.credential,
      ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    }),
  );
  const runtime = makeConnectionAtomRuntime(session, options.appVersion);
  const state = makeTuiState(runtime);
  const registry = AtomRegistry.make();

  const instance = render(
    h(
      RegistryContext.Provider,
      { value: registry },
      h(App, { session, state, openGui: options.openGui, cwd: process.cwd() }),
    ),
    { exitOnCtrlC: false, alternateScreen: true },
  );
  try {
    await instance.waitUntilExit();
  } finally {
    registry.dispose();
  }
}
