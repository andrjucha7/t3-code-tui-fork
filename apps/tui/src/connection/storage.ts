import {
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  type ConnectionCatalogDocument,
  putRemoteDpopTokenInCatalog,
  registerConnectionInCatalog,
  removeCatalogValue,
  removeConnectionFromCatalog,
  replaceCatalogValue,
  setConnectionEnabledInCatalog,
  setRoutesInCatalog,
  Persistence,
} from "@t3tools/client-runtime/platform";
import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  CredentialStore,
  GitHubRoutingPermissions,
  ProfileStore,
  makeGitHubRoutingPermissions,
} from "@t3tools/client-runtime/connection";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

/**
 * The TUI is a short-lived client of a server on the same machine, so its
 * connection catalog lives in memory: every launch pairs again with a fresh
 * credential minted by `t3 tui`.
 */
const makeCatalog = Effect.gen(function* () {
  const ref = yield* Ref.make<ConnectionCatalogDocument>(EMPTY_CONNECTION_CATALOG_DOCUMENT);
  return {
    read: Ref.get(ref),
    update: (f: (document: ConnectionCatalogDocument) => ConnectionCatalogDocument) =>
      Ref.update(ref, f),
  };
});

export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const catalog = yield* makeCatalog;
    const githubRoutingPermissions = yield* makeGitHubRoutingPermissions({
      read: catalog.read.pipe(Effect.map((document) => document.githubRoutingPermissions ?? [])),
      write: (githubRoutingPermissions) =>
        catalog.update((document) => ({ ...document, githubRoutingPermissions })),
    });

    const targetStore = Persistence.ConnectionTargetStore.of({
      list: catalog.read.pipe(Effect.map((document) => document.targets)),
      listDisabled: catalog.read.pipe(Effect.map((document) => document.disabledEnvironmentIds)),
    });
    const registrationStore = Persistence.ConnectionRegistrationStore.of({
      register: (registration, routes) =>
        catalog.update((document) => registerConnectionInCatalog(document, registration, routes)),
      setRoutes: (environmentId, routes) =>
        catalog.update((document) => setRoutesInCatalog(document, environmentId, routes)),
      remove: (environmentId) =>
        catalog.update((document) => removeConnectionFromCatalog(document, environmentId)),
      setEnabled: (environmentId, enabled) =>
        catalog.update((document) =>
          setConnectionEnabledInCatalog(document, environmentId, enabled),
        ),
    });
    const profileStore = ProfileStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.profiles.find((candidate) => candidate.connectionId === connectionId),
            ),
          ),
        ),
      put: (profile) =>
        catalog.update((document) => ({
          ...document,
          profiles: replaceCatalogValue(document.profiles, (value) => value.connectionId, profile),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          profiles: removeCatalogValue(
            document.profiles,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const credentialStore = CredentialStore.make({
      get: (connectionId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.credentials.find((entry) => entry.connectionId === connectionId)?.credential,
            ),
          ),
        ),
      put: (connectionId, credential) =>
        catalog.update((document) => ({
          ...document,
          credentials: replaceCatalogValue(document.credentials, (value) => value.connectionId, {
            connectionId,
            credential,
          }),
        })),
      remove: (connectionId) =>
        catalog.update((document) => ({
          ...document,
          credentials: removeCatalogValue(
            document.credentials,
            (value) => value.connectionId,
            connectionId,
          ),
        })),
    });
    const remoteTokenStore = TokenStore.make({
      get: (environmentId) =>
        catalog.read.pipe(
          Effect.map((document) =>
            Option.fromUndefinedOr(
              document.remoteDpopTokens.find((token) => token.environmentId === environmentId),
            ),
          ),
        ),
      put: (token) => catalog.update((document) => putRemoteDpopTokenInCatalog(document, token)),
      remove: (environmentId) =>
        catalog.update((document) => ({
          ...document,
          remoteDpopTokens: removeCatalogValue(
            document.remoteDpopTokens,
            (value) => value.environmentId,
            environmentId,
          ),
        })),
    });
    const cacheStore = Persistence.EnvironmentCacheStore.of({
      loadShell: () => Effect.succeedNone,
      saveShell: () => Effect.void,
      loadThread: () => Effect.succeedNone,
      saveThread: () => Effect.void,
      removeThread: () => Effect.void,
      loadServerConfig: () => Effect.succeedNone,
      saveServerConfig: () => Effect.void,
      loadVcsRefs: () => Effect.succeedNone,
      saveVcsRefs: () => Effect.void,
      removeVcsRefs: () => Effect.void,
      clearVcsRefs: () => Effect.void,
      clear: () => Effect.void,
    });
    return Context.make(Persistence.ConnectionTargetStore, targetStore).pipe(
      Context.add(GitHubRoutingPermissions, githubRoutingPermissions),
      Context.add(Persistence.ConnectionRegistrationStore, registrationStore),
      Context.add(Persistence.EnvironmentCacheStore, cacheStore),
      Context.add(ProfileStore.ConnectionProfileStore, profileStore),
      Context.add(CredentialStore.ConnectionCredentialStore, credentialStore),
      Context.add(TokenStore.RemoteDpopAccessTokenStore, remoteTokenStore),
    );
  }),
);
