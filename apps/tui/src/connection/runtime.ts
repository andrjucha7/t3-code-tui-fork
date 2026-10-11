import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { layerRemoteHttpClient } from "@t3tools/client-runtime/rpc";
import { RelayWebClientId } from "@t3tools/contracts/relay";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Socket from "effect/socket/Socket";

const layerHttpClient = layerRemoteHttpClient((input, init) => globalThis.fetch(input, init));

/**
 * The TUI never talks to T3 Connect: it reaches the local server directly. The
 * connection runtime still requires a managed relay, so it gets one pointing
 * nowhere whose signer refuses every proof.
 */
const layerRelayDpopSigner = Layer.succeed(
  ManagedRelay.ManagedRelayDpopSigner,
  ManagedRelay.ManagedRelayDpopSigner.of({
    // Unreachable: nothing in the TUI signs in to the relay.
    thumbprint: Effect.die(new Error("T3 Connect is not available in the terminal UI.")),
    createProof: (input) =>
      Effect.fail(
        new ManagedRelay.ManagedRelayDpopProofCreationError({
          method: input.method,
          url: input.url,
          cause: "T3 Connect is not available in the terminal UI.",
        }),
      ),
  }),
);

export const layer = Layer.mergeAll(
  ManagedRelay.layer({ relayUrl: "http://relay.invalid", clientId: RelayWebClientId }).pipe(
    Layer.provideMerge(layerRelayDpopSigner),
  ),
  Socket.layerWebSocketConstructorGlobal,
).pipe(Layer.provideMerge(NodeCrypto.layer), Layer.provideMerge(layerHttpClient));
