// Aggregates GTKX_PERF per-second dumps from a probe run, split by the
// PERF_MARK phases the probe app logs. Usage: node parse-log.ts <log> [...]
import { readFileSync } from "node:fs"

interface PhaseEntry {
  seconds: number
  sums: Map<string, number>
  maxes: Map<string, number>
}

const aggregate = (file: string): void => {
  const lines = readFileSync(file, "utf8").split("\n")
  let phase = "startup"
  const phases = new Map<string, PhaseEntry>()
  const bucket = (): PhaseEntry => {
    let entry = phases.get(phase)
    if (!entry) {
      entry = { seconds: 0, sums: new Map(), maxes: new Map() }
      phases.set(phase, entry)
    }
    return entry
  }
  for (const line of lines) {
    const markMatch = /^(?:GTKX_)?PERF_MARK (\S+)/.exec(line)
    if (markMatch) {
      const label = markMatch[1] ?? ""
      if (label.endsWith(":start")) {
        phase = label.slice(0, -":start".length)
      } else if (label.endsWith(":end")) {
        phase = "between"
      } else if (label === "reset") {
        phase = "between"
      } else if (label === "PERF_DONE") {
        phase = "done"
      }
      continue
    }
    if (line.startsWith("PERF_MARK config")) {
      continue
    }
    if (!line.startsWith("GTKX_PERF ")) {
      continue
    }
    const data = JSON.parse(line.slice("GTKX_PERF ".length)) as Record<
      string,
      number
    >
    const entry = bucket()
    entry.seconds += 1
    for (const [key, value] of Object.entries(data)) {
      if (key === "t") {
        continue
      }
      if (key.endsWith(".max") || key === "frame.max") {
        entry.maxes.set(key, Math.max(entry.maxes.get(key) ?? 0, value))
      } else {
        entry.sums.set(key, (entry.sums.get(key) ?? 0) + value)
      }
    }
  }
  const config = lines.find((line) => line.startsWith("PERF_MARK config"))
  console.log(`\n=== ${file}`)
  if (config) {
    console.log(config.replace(/^PERF_MARK /, ""))
  }
  for (const [name, entry] of phases) {
    if (entry.seconds === 0) {
      continue
    }
    console.log(`\n--- phase ${name} (${entry.seconds}s)`)
    const keys = [...entry.sums.keys()].sort()
    for (const key of keys) {
      const total = entry.sums.get(key) ?? 0
      const perSec = total / entry.seconds
      const rounded = Math.round(perSec * 100) / 100
      if (key === "frame.avg") {
        console.log(`  ${key.padEnd(20)} mean/s=${rounded}`)
      } else {
        console.log(
          `  ${key.padEnd(20)} total=${Math.round(total * 100) / 100} per-sec=${rounded}`,
        )
      }
    }
    for (const [key, value] of [...entry.maxes.entries()].sort()) {
      console.log(`  ${key.padEnd(20)} max=${Math.round(value * 100) / 100}`)
    }
  }
}

for (const file of process.argv.slice(2)) {
  aggregate(file)
}
