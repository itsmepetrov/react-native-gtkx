import { expect, it } from "vitest"
import { LayoutEngine, type LayoutNode } from "../../src/layout/index.js"

// AC (task 004): reflow of a 500-node tree <= 16ms, no-op recompute <= 1ms.
// Thresholds are generous vs the spike numbers (0.17ms) to stay CI-stable.
it("reflows a 500-node tree within the frame budget", async () => {
  const engine = new LayoutEngine({ width: 1280, height: 800 })
  const rows: LayoutNode[] = []

  for (let r = 0; r < 25; r += 1) {
    const row = engine.createNode()
    row.setStyle({ flexDirection: "row", gap: 2, height: 30 })
    engine.root.insertChild(row, r)
    rows.push(row)
    for (let c = 0; c < 19; c += 1) {
      const cell = engine.createNode()
      cell.setStyle({ flex: 1 })
      row.insertChild(cell, c)
    }
  }
  engine.flushSync()

  const passes = 50
  const start = performance.now()
  for (let i = 0; i < passes; i += 1) {
    rows[i % rows.length]!.setStyle({
      flexDirection: "row",
      gap: 2,
      height: 30 + (i % 7),
    })
    engine.flushSync()
  }
  const avgReflow = (performance.now() - start) / passes
  expect(avgReflow).toBeLessThan(16)

  const idleStart = performance.now()
  engine.flushSync()
  const idle = performance.now() - idleStart
  expect(idle).toBeLessThan(1)

  engine.dispose()
})
