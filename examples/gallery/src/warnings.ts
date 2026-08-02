// The "Reanimated limits" section shows the refusal warnings ON SCREEN rather
// than only on stderr, because a demo whose "this is refused" case looks
// identical to its "this works" case is not showing anything. So
// `console.warn` is wrapped here — ordinary JavaScript, no platform API — and
// the section reads the buffer.
//
// Imported for its side effect from src/index.tsx, before the app module is
// evaluated, so the very first warning is caught.
import { useEffect, useState } from "react"

const captured: string[] = []

const original = console.warn.bind(console)

console.warn = (...args: unknown[]): void => {
  captured.push(args.map((arg) => String(arg)).join(" "))
  original(...args)
}

const EMPTY: readonly string[] = []

/**
 * The warnings seen so far whose text starts with `prefix`, polled into
 * state. State rather than a read during render for the same reason
 * src/stats.ts snapshots its counters: the React Compiler memoises a render
 * that has no changing input, and a module-level array never changes
 * identity. A new array only replaces the old one when the count changed, so
 * a section that has already shown its warning stops re-rendering.
 */
export const useWarnings = (
  prefix: string,
  intervalMs = 400,
): readonly string[] => {
  const [lines, setLines] = useState<readonly string[]>(EMPTY)
  useEffect(() => {
    const timer = setInterval(() => {
      const next = captured.filter((line) => line.startsWith(prefix))
      setLines((current) =>
        current.length === next.length ? current : (next as readonly string[]),
      )
    }, intervalMs)
    return () => clearInterval(timer)
  }, [prefix, intervalMs])
  return lines
}
