import { Connection } from "@t3tools/client-runtime/connection";
import { EnvironmentRpcSubscriptionObserver } from "@t3tools/client-runtime/rpc";
import { ShellSnapshotLoader } from "@t3tools/client-runtime/state/shell";
import {
  BoundedThreadSnapshotLoader,
  ThreadHistoryController,
} from "@t3tools/client-runtime/state/threads";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Atom } from "effect/reactivity";

import * as ConnectionPlatform from "./platform.ts";
import * as Runtime from "./runtime.ts";
import type { TuiSession } from "./session.ts";

const layerSnapshotLoader = Layer.mergeAll(
  BoundedThreadSnapshotLoader.layer,
  ShellSnapshotLoader.layer,
  ThreadHistoryController.layer,
);

const layerSubscriptionObserver = Layer.succeed(
  EnvironmentRpcSubscriptionObserver,
  EnvironmentRpcSubscriptionObserver.of({ observe: () => Effect.succeed(Effect.void) }),
);

export const makeConnectionAtomRuntime = (session: TuiSession, appVersion: string | undefined) =>
  Atom.runtime(
    layerSnapshotLoader.pipe(
      Layer.provideMerge(
        Connection.layerWithOptions({ usageLimitSources: true, usageLimitsCommand: true }),
      ),
      Layer.provideMerge(
        Layer.mergeAll(
          Runtime.layer,
          ConnectionPlatform.layer(session, appVersion).pipe(Layer.provide(Runtime.layer)),
          layerSubscriptionObserver,
        ),
      ),
    ),
  );

export type ConnectionAtomRuntime = ReturnType<typeof makeConnectionAtomRuntime>;
