import {
  ClientCapabilities,
  Persistence,
  PlatformConnectionSource,
} from "@t3tools/client-runtime/platform";
import {
  ConnectionBlockedError,
  Connectivity,
  PrimaryConnectionRegistration,
  PrimaryConnectionTarget,
  Wakeups,
} from "@t3tools/client-runtime/connection";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ConnectionStorage from "./storage.ts";
import { clientMetadata, type TuiSession } from "./session.ts";

const layerConnectivity = Connectivity.layer({
  status: Effect.succeed("online"),
  changes: Stream.empty,
});

const layerWakeups = Wakeups.layer({ changes: Stream.empty });

const unsupportedSsh = new ConnectionBlockedError({
  reason: "unsupported",
  detail: "SSH environments are only available in the desktop app.",
});

const layerCapabilities = (session: TuiSession, appVersion: string | undefined) =>
  Layer.succeedContext(
    Context.make(
      ClientCapabilities.CloudSession,
      ClientCapabilities.CloudSession.of({
        identity: Effect.succeedNone,
        clerkToken: Effect.fail(
          new ConnectionBlockedError({
            reason: "authentication",
            detail: "T3 Connect is not available in the terminal UI.",
          }),
        ),
      }),
    ).pipe(
      Context.add(
        ClientCapabilities.PrimaryEnvironmentAuth,
        ClientCapabilities.PrimaryEnvironmentAuth.of({
          bearerToken: Effect.succeedSome(session.bearerToken),
        }),
      ),
      Context.add(
        ClientCapabilities.RelayDeviceIdentity,
        ClientCapabilities.RelayDeviceIdentity.of({ deviceId: Effect.succeedNone }),
      ),
      Context.add(
        ClientCapabilities.ClientPresentation,
        ClientCapabilities.ClientPresentation.of({ metadata: clientMetadata(appVersion) }),
      ),
      Context.add(
        ClientCapabilities.SshEnvironmentGateway,
        ClientCapabilities.SshEnvironmentGateway.of({
          provision: () => Effect.fail(unsupportedSsh),
          prepare: () => Effect.fail(unsupportedSsh),
          disconnect: () => Effect.void,
        }),
      ),
    ),
  );

const layerPlatformConnectionSource = (session: TuiSession) =>
  Layer.succeed(
    PlatformConnectionSource.PlatformConnectionSource,
    PlatformConnectionSource.PlatformConnectionSource.of({
      registrations: Stream.make([
        new PrimaryConnectionRegistration({
          target: new PrimaryConnectionTarget({
            environmentId: session.environmentId,
            label: session.label,
            httpBaseUrl: session.httpBaseUrl,
            wsBaseUrl: session.wsBaseUrl,
          }),
        }),
      ]).pipe(Stream.concat(Stream.never)),
    }),
  );

const layerEnvironmentOwnedDataCleanup = Layer.succeed(
  Persistence.EnvironmentOwnedDataCleanup,
  Persistence.EnvironmentOwnedDataCleanup.of({ clear: () => Effect.void }),
);

export const layer = (session: TuiSession, appVersion: string | undefined) =>
  Layer.mergeAll(
    ConnectionStorage.layer,
    layerConnectivity,
    layerWakeups,
    layerCapabilities(session, appVersion),
    layerPlatformConnectionSource(session),
    layerEnvironmentOwnedDataCleanup,
  );
