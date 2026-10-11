/**
 * `t3 tui` - drive a running T3 Code server from the terminal.
 *
 * Discovers the server the same way `t3 pair` does, mints a one-time pairing
 * credential for it, and hands that to the Ink app in `@t3tools/tui`. The TUI
 * can bring the graphical app back up at any time: the desktop app when it is
 * running, otherwise a freshly paired browser tab.
 */
import { AuthStandardClientScopes } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, GlobalFlag } from "effect/cli";
import { FetchHttpClient } from "effect/http";

import packageJson from "../../package.json" with { type: "json" };
import * as ExternalLauncher from "../process/externalLauncher.ts";
import { buildPairingUrl } from "../startupAccess.ts";
import { activateDesktopApp } from "./app.ts";
import { baseDirFlag } from "./config.ts";
import {
  discoverPairTarget,
  makePairServerConfig,
  mintPairingLink,
  resolveDirectPairingBaseUrl,
} from "./pair.ts";

export class TuiFailedError extends Schema.TaggedError<TuiFailedError>()("TuiFailedError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `The terminal UI stopped unexpectedly: ${String(this.cause)}`;
  }
}

export const tuiCommand = Command.make("tui", {
  baseDir: baseDirFlag,
}).pipe(
  Command.withDescription(
    "Open the terminal UI for a running T3 Code server (start one with `t3` or `t3 serve`).",
  ),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const cliLogLevel = yield* GlobalFlag.LogLevel;
      // Log lines would tear through the full-screen UI.
      const logLevel = Option.getOrElse(cliLogLevel, () => "Error" as const);

      const target = yield* discoverPairTarget(Option.getOrUndefined(flags.baseDir));
      const config = yield* makePairServerConfig({ target, logLevel });
      const mintCredential = (label: string) =>
        mintPairingLink({
          config,
          scopes: AuthStandardClientScopes,
          ttl: Option.none(),
          label: Option.some(label),
        }).pipe(Effect.map((issued) => issued.credential));

      const launcher = yield* ExternalLauncher.ExternalLauncher;
      const openInBrowser = mintCredential("t3 tui (browser)").pipe(
        Effect.flatMap((credential) =>
          launcher.launchBrowser(
            buildPairingUrl(resolveDirectPairingBaseUrl(target.state), credential),
          ),
        ),
      );
      // Prefer the desktop window; fall back to a browser tab when it is not running.
      const openGui = activateDesktopApp({
        baseDir: Option.some(target.baseDir),
        workspaceRoot: Option.none(),
      }).pipe(
        Effect.asVoid,
        Effect.catch(() => openInBrowser),
      );

      const context = yield* Effect.context<Effect.Services<typeof openGui>>();
      const credential = yield* mintCredential("t3 tui");
      // Bundled lazily so the server and other commands never load Ink/React.
      const tui = yield* Effect.promise(() => import("@t3tools/tui"));
      yield* Effect.tryPromise({
        try: () =>
          tui.run({
            httpBaseUrl: target.state.origin,
            credential,
            appVersion: packageJson.version,
            openGui: () => Effect.runPromiseWith(context)(openGui),
          }),
        catch: (cause) => new TuiFailedError({ cause }),
      });
    }).pipe(Effect.provide(Layer.mergeAll(ExternalLauncher.layer, FetchHttpClient.layer))),
  ),
);
