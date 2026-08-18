// Tolerating a KNOWN, already-documented GTK/libadwaita critical without it
// failing the suite.
//
// gtkx 1.2.1 changed GLib log criticals/errors from "logged" to "raised as
// an uncaught exception" (`napi_fatal_exception`, see docs/gtkx-1.2-notes.md
// on ask #2). A few GTK/libadwaita internals raise a critical that is
// upstream, well understood, and harmless — each call site that provokes
// one already names exactly which and why (see
// touchpad-gestures.gtk.test.tsx's file header and
// platform/widget-surface.gtk.test.tsx's "TWO GTK LOG LINES" comment). Under
// 1.0, that was a log line the test's own header comment told a reader to
// expect. Under 1.2.1+, the same critical becomes an `uncaughtException`
// vitest's own listener reports in its end-of-run "Unhandled Errors"
// summary — which fails the whole run even though nothing broke and every
// named assertion still passes.
//
// vitest's own listener steps back the moment a second one exists:
// `node_modules/vitest/dist/chunks/init.*.js`'s `catchError` reads
// `if (processListeners(event).length > 1) return` — "if there is another
// listener, assume that it's handled by user code". Registering one for the
// span of the action that provokes the critical is the sanctioned way to
// keep an EXPECTED one out of the summary, without silencing a real one: an
// uncaught exception whose message doesn't match is re-thrown for real.
import { setImmediate } from "node:timers/promises"

/**
 * Runs `action`, tolerating any `uncaughtException` whose message contains
 * `expectedMessageFragment` — anything else re-throws once `action` and one
 * extra tick (napi_fatal_exception delivers on a later tick, not inside the
 * native call itself) have both had their chance to run.
 */
export const withExpectedCritical = async (
  expectedMessageFragment: string,
  action: () => unknown,
): Promise<void> => {
  const unexpected: unknown[] = []
  const onUncaughtException = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(expectedMessageFragment)) {
      unexpected.push(error)
    }
  }

  process.on("uncaughtException", onUncaughtException)
  try {
    await action()
    await setImmediate()
  } finally {
    process.off("uncaughtException", onUncaughtException)
  }

  if (unexpected.length > 0) {
    throw unexpected[0]
  }
}
