import { bootstrapRemoteBearerSession } from "@t3tools/client-runtime/authorization";
import { fetchRemoteEnvironmentDescriptor } from "@t3tools/client-runtime/environment";
import {
  AuthStandardClientScopes,
  type AuthClientPresentationMetadata,
  type EnvironmentId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { FetchHttpClient } from "effect/http";

export interface TuiSession {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly bearerToken: string;
}

export function clientMetadata(appVersion: string | undefined): AuthClientPresentationMetadata {
  return {
    label: "T3 Code TUI",
    surface: "cli",
    deviceType: "desktop",
    os: process.platform,
    ...(appVersion ? { appVersion } : {}),
  };
}

export function toWebSocketBaseUrl(httpBaseUrl: string): string {
  const url = new URL(httpBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

/**
 * Exchanges the one-time pairing credential minted by `t3 tui` for a bearer
 * session, and reads which environment the server is.
 */
export const openSession = Effect.fn("tui.openSession")(function* (input: {
  readonly httpBaseUrl: string;
  readonly credential: string;
  readonly appVersion?: string;
}) {
  const descriptor = yield* fetchRemoteEnvironmentDescriptor({ httpBaseUrl: input.httpBaseUrl });
  const access = yield* bootstrapRemoteBearerSession({
    httpBaseUrl: input.httpBaseUrl,
    credential: input.credential,
    scopes: AuthStandardClientScopes,
    clientMetadata: clientMetadata(input.appVersion),
  });
  return {
    environmentId: descriptor.environmentId,
    label: descriptor.label,
    httpBaseUrl: input.httpBaseUrl,
    wsBaseUrl: toWebSocketBaseUrl(input.httpBaseUrl),
    bearerToken: access.access_token,
  } satisfies TuiSession;
}, Effect.provide(FetchHttpClient.layer));
