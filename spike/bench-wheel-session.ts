import { performance } from "node:perf_hooks"
import { createWheelScrollSession } from "../packages/react-native-gtkx/src/components/wheel-scroll-session.ts"

const iterations = 20_000
const rounds = 15
const samples: number[] = []
for (let round = 0; round < rounds; round += 1) {
  const session = createWheelScrollSession(
    () => {},
    () => {},
  )
  const started = performance.now()
  for (let index = 0; index < iterations; index += 1) {
    session.detent()
  }
  samples.push(((performance.now() - started) * 1000) / iterations)
  session.dispose()
}
samples.sort((a, b) => a - b)
console.log(
  JSON.stringify({
    iterations,
    rounds,
    medianUs: samples[Math.floor(rounds / 2)],
    minUs: samples[0],
    maxUs: samples.at(-1),
  }),
)
