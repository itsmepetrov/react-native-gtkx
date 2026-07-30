// TEMPORARY perf instrumentation for the scroll-lag investigation
// (perf-scroll branch). Enabled only when GTKX_PERF=1 is set in the
// environment; otherwise every hook is a cheap boolean check. Counters are
// accumulated and dumped once per second as a single machine-parseable
// stdout line: `GTKX_PERF {json}`. Pure JS — no FFI — so it is safe to
// import from any module in the package.

export const perfEnabled =
  typeof process !== "undefined" && process.env.GTKX_PERF === "1"

const counters = new Map<string, number>()
// Duration accumulators (ms) with call counts and max, keyed by name.
const timers = new Map<string, { totalMs: number; count: number; maxMs: number }>()

// Frame-clock interval tracking: deltas between consecutive ticks.
let lastFrameAt = -1
let frameCount = 0
let frameLate = 0 // interval > 17ms
let frameVeryLate = 0 // interval > 33ms
let frameMaxMs = 0
let frameTotalMs = 0

export const perfCount = (name: string, n = 1): void => {
  if (!perfEnabled) {
    return
  }
  counters.set(name, (counters.get(name) ?? 0) + n)
}

export const perfNow = (): number => performance.now()

export const perfAddTime = (name: string, ms: number): void => {
  if (!perfEnabled) {
    return
  }
  const entry = timers.get(name)
  if (entry) {
    entry.totalMs += ms
    entry.count += 1
    if (ms > entry.maxMs) {
      entry.maxMs = ms
    }
  } else {
    timers.set(name, { totalMs: ms, count: 1, maxMs: ms })
  }
}

// Called from a GTK frame-clock tick callback; `now` in ms (performance.now).
export const perfFrameTick = (now: number): void => {
  if (!perfEnabled) {
    return
  }
  if (lastFrameAt >= 0) {
    const delta = now - lastFrameAt
    // A gap over 250ms means the frame clock paused (idle) — not a late
    // frame; restart the interval chain instead of recording it.
    if (delta < 250) {
      frameCount += 1
      frameTotalMs += delta
      if (delta > 17) {
        frameLate += 1
      }
      if (delta > 33) {
        frameVeryLate += 1
      }
      if (delta > frameMaxMs) {
        frameMaxMs = delta
      }
    }
  }
  lastFrameAt = now
}

// Marks phases (driven by the probe app) so the log parser can attribute
// per-second stats to scroll phases.
export const perfMark = (label: string): void => {
  if (!perfEnabled) {
    return
  }
  // eslint-disable-next-line no-console -- deliberate script-facing output
  console.log(`GTKX_PERF_MARK ${label} ${performance.now().toFixed(1)}`)
}

let reporterStarted = false

const dump = (): void => {
  const out: Record<string, number> = {}
  for (const [name, value] of counters) {
    out[name] = value
  }
  counters.clear()
  for (const [name, entry] of timers) {
    out[`${name}.ms`] = Math.round(entry.totalMs * 100) / 100
    out[`${name}.n`] = entry.count
    out[`${name}.max`] = Math.round(entry.maxMs * 100) / 100
  }
  timers.clear()
  if (frameCount > 0) {
    out["frame.count"] = frameCount
    out["frame.late"] = frameLate
    out["frame.veryLate"] = frameVeryLate
    out["frame.max"] = Math.round(frameMaxMs * 100) / 100
    out["frame.avg"] = Math.round((frameTotalMs / frameCount) * 100) / 100
  }
  frameCount = 0
  frameLate = 0
  frameVeryLate = 0
  frameMaxMs = 0
  frameTotalMs = 0
  if (Object.keys(out).length === 0) {
    return
  }
  out.t = Math.round(performance.now())
  // eslint-disable-next-line no-console -- deliberate script-facing output
  console.log(`GTKX_PERF ${JSON.stringify(out)}`)
}

export const ensurePerfReporter = (): void => {
  if (!perfEnabled || reporterStarted) {
    return
  }
  reporterStarted = true
  setInterval(dump, 1000)
}
