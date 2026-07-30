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
const timers = new Map<
  string,
  { totalMs: number; count: number; maxMs: number }
>()
// Per-frame burst accumulators: reset on every frame-clock tick, reported as
// the WORST single frame of the second. A stall is invisible in per-second
// sums (a 12-mount burst inside one frame and 12 mounts spread over a second
// sum identically) — the burst maxima are what a flick actually feels like.
const frameBurst = new Map<string, number>()
const frameBurstMax = new Map<string, number>()

// Frame-clock interval tracking: deltas between consecutive ticks.
let lastFrameAt = -1
let frameCount = 0
// A healthy 60Hz tick jitters 16.6-16.9ms, so 17ms would count noise:
// "late" = one visibly stretched frame (>20ms), "veryLate" = at least one
// whole frame dropped (>34ms).
let frameLate = 0 // interval > 20ms
let frameVeryLate = 0 // interval > 34ms
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

// Accumulates into the CURRENT frame's bucket (counts or ms); the reporter
// keeps only the worst frame of each second, under `<name>.max`.
export const perfBurst = (name: string, value = 1): void => {
  if (!perfEnabled) {
    return
  }
  frameBurst.set(name, (frameBurst.get(name) ?? 0) + value)
}

// A sampled level (not a rate): reported as the second's maximum, so keys
// like the live node count read as "how big did it get".
export const perfGauge = (name: string, value: number): void => {
  if (!perfEnabled) {
    return
  }
  if (value > (frameBurstMax.get(name) ?? 0)) {
    frameBurstMax.set(name, value)
  }
}

const rollFrameBurst = (): void => {
  for (const [name, value] of frameBurst) {
    if (value > (frameBurstMax.get(name) ?? 0)) {
      frameBurstMax.set(name, value)
    }
  }
  frameBurst.clear()
}

// Called from a GTK frame-clock tick callback; `now` in ms (performance.now).
export const perfFrameTick = (now: number): void => {
  if (!perfEnabled) {
    return
  }
  rollFrameBurst()
  if (lastFrameAt >= 0) {
    const delta = now - lastFrameAt
    // A gap over 250ms means the frame clock paused (idle) — not a late
    // frame; restart the interval chain instead of recording it.
    if (delta < 250) {
      frameCount += 1
      frameTotalMs += delta
      if (delta > 20) {
        frameLate += 1
      }
      if (delta > 34) {
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
  // The tail of the second has not been rolled by a tick yet.
  rollFrameBurst()
  for (const [name, value] of frameBurstMax) {
    out[`${name}.max`] = Math.round(value * 100) / 100
  }
  frameBurstMax.clear()
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
