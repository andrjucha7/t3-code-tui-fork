import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";

const randomUuid = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  return yield* crypto.randomUUIDv4;
}).pipe(Effect.orDie, Effect.provide(NodeCrypto.layer));

/** A v4 UUID for client-allocated thread and message ids. */
export function newUuid(): string {
  return Effect.runSync(randomUuid);
}
