import { describe, expect, it, vi } from "vitest"
import { getLiveNodeCount, LayoutEngine } from "../../../src/layout/index"
import type { MeasureFn, Rect } from "../../../src/contracts"

const nextMicrotask = (): Promise<void> =>
  new Promise((resolve) => {
    queueMicrotask(resolve)
  })

const VIEWPORT = { width: 400, height: 300 }

describe("LayoutEngine", () => {
  it("batches several mutations into one flush per microtask", async () => {
    const engine = new LayoutEngine(VIEWPORT)
    const child = engine.createNode()
    engine.root.insertChild(child, 0)

    const commits: Rect[] = []
    child.setCommit((rect) => commits.push(rect))

    child.setStyle({ width: 100, height: 50 })
    child.setStyle({ width: 120, height: 50 })
    child.setStyle({ width: 140, height: 50 })
    expect(commits.length).toBe(0)

    await nextMicrotask()
    expect(commits.length).toBe(1)
    expect(commits[0]).toEqual({ x: 0, y: 0, width: 140, height: 50 })
    engine.dispose()
  })

  it("does not notify nodes whose rect did not change", async () => {
    const engine = new LayoutEngine(VIEWPORT)
    const moving = engine.createNode()
    const stable = engine.createNode()
    engine.root.insertChild(moving, 0)
    engine.root.insertChild(stable, 1)
    moving.setStyle({
      position: "absolute",
      top: 0,
      left: 0,
      width: 50,
      height: 50,
    })
    stable.setStyle({
      position: "absolute",
      top: 100,
      left: 0,
      width: 50,
      height: 50,
    })
    await nextMicrotask()

    const movingCommits = vi.fn()
    const stableCommits = vi.fn()
    moving.setCommit(movingCommits)
    stable.setCommit(stableCommits)
    movingCommits.mockClear()
    stableCommits.mockClear()

    moving.setStyle({
      position: "absolute",
      top: 10,
      left: 10,
      width: 50,
      height: 50,
    })
    await nextMicrotask()

    expect(movingCommits).toHaveBeenCalledTimes(1)
    expect(stableCommits).not.toHaveBeenCalled()
    engine.dispose()
  })

  // The incremental walk must not confuse "not mutated" with "not moved":
  // resizing one child shifts the siblings after it, and resizing a container
  // resizes its stretched children. Neither of those nodes is ever passed to
  // setStyle, so only Yoga knows their layout changed.
  it("commits nodes Yoga moved without them being touched", async () => {
    const engine = new LayoutEngine(VIEWPORT)
    const first = engine.createNode()
    const second = engine.createNode()
    const inner = engine.createNode()
    engine.root.insertChild(first, 0)
    engine.root.insertChild(second, 1)
    second.insertChild(inner, 0)
    first.setStyle({ width: 100, height: 20 })
    second.setStyle({ width: 100, height: 40 })
    inner.setStyle({ height: 10 })
    await nextMicrotask()
    expect(second.getRect()).toEqual({ x: 0, y: 20, width: 100, height: 40 })
    expect(inner.getRect()).toEqual({ x: 0, y: 0, width: 100, height: 10 })

    const secondCommits = vi.fn()
    const innerCommits = vi.fn()
    second.setCommit(secondCommits)
    inner.setCommit(innerCommits)
    secondCommits.mockClear()
    innerCommits.mockClear()

    // The sibling BELOW the resized one shifts down; its own subtree keeps its
    // parent-relative geometry and must stay untouched.
    first.setStyle({ width: 100, height: 50 })
    await nextMicrotask()
    expect(second.getRect()).toEqual({ x: 0, y: 50, width: 100, height: 40 })
    expect(secondCommits).toHaveBeenCalledTimes(1)
    expect(innerCommits).not.toHaveBeenCalled()

    // Padding on the container squeezes the stretched child: the child moved
    // and shrank without anyone styling it.
    second.setStyle({ width: 100, height: 40, paddingLeft: 12 })
    await nextMicrotask()
    expect(inner.getRect()).toEqual({ x: 12, y: 0, width: 88, height: 10 })
    expect(innerCommits).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  it("fires onLayout after first pass with parent-relative coords, then only on change", async () => {
    const engine = new LayoutEngine(VIEWPORT)
    const parent = engine.createNode()
    const child = engine.createNode()
    engine.root.insertChild(parent, 0)
    parent.insertChild(child, 0)
    parent.setStyle({ padding: 20, width: 200, height: 200 })
    child.setStyle({ width: 80, height: 40 })

    const layouts: Rect[] = []
    child.setOnLayout((rect) => layouts.push(rect))
    await nextMicrotask()

    expect(layouts).toEqual([{ x: 20, y: 20, width: 80, height: 40 }])

    // Unrelated change elsewhere must not re-fire an unchanged child.
    engine.root.setStyle({ padding: 0 })
    await nextMicrotask()
    expect(layouts.length).toBe(1)

    child.setStyle({ width: 90, height: 40 })
    await nextMicrotask()
    expect(layouts.length).toBe(2)
    expect(layouts[1]).toEqual({ x: 20, y: 20, width: 90, height: 40 })
    engine.dispose()
  })

  it("delivers the current rect to a commit hook registered after layout", async () => {
    const engine = new LayoutEngine(VIEWPORT)
    const child = engine.createNode()
    engine.root.insertChild(child, 0)
    child.setStyle({ width: 60, height: 30 })
    await nextMicrotask()

    const commits: Rect[] = []
    child.setCommit((rect) => commits.push(rect))
    expect(commits).toEqual([{ x: 0, y: 0, width: 60, height: 30 }])
    engine.dispose()
  })

  it("reflows on viewport change and ignores identical viewport", async () => {
    const engine = new LayoutEngine(VIEWPORT)
    const child = engine.createNode()
    engine.root.insertChild(child, 0)
    child.setStyle({ width: "50%", height: 20 })
    await nextMicrotask()
    expect(child.getRect()?.width).toBe(200)

    const commits = vi.fn()
    child.setCommit(commits)
    commits.mockClear()

    engine.setViewport({ width: 400, height: 300 })
    await nextMicrotask()
    expect(commits).not.toHaveBeenCalled()

    engine.setViewport({ width: 600, height: 300 })
    await nextMicrotask()
    expect(child.getRect()?.width).toBe(300)
    expect(commits).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  it("re-measures leaves via markDirty", async () => {
    const engine = new LayoutEngine(VIEWPORT)
    // flex-start prevents the default cross-axis stretch from overriding the
    // measured width.
    engine.root.setStyle({ alignItems: "flex-start" })
    const leaf = engine.createNode()
    engine.root.insertChild(leaf, 0)

    let contentLength = 100
    const measure: MeasureFn = (width, widthMode) => {
      const natural = contentLength
      const used =
        widthMode === "undefined" ? natural : Math.min(natural, width)
      return { width: used, height: 20 * Math.ceil(natural / used) }
    }
    leaf.setMeasureFn(measure)
    await nextMicrotask()
    expect(leaf.getRect()?.width).toBe(100)

    contentLength = 250
    leaf.markDirty()
    await nextMicrotask()
    expect(leaf.getRect()?.width).toBe(250)
    engine.dispose()
  })

  it("passes constraint modes to the measure function", async () => {
    const engine = new LayoutEngine({ width: 200, height: 100 })
    const container = engine.createNode()
    const leaf = engine.createNode()
    engine.root.insertChild(container, 0)
    container.insertChild(leaf, 0)
    container.setStyle({ width: 150, alignItems: "flex-start" })

    const seen: string[] = []
    leaf.setMeasureFn((width, widthMode) => {
      seen.push(`${widthMode}:${width}`)
      return { width: 50, height: 10 }
    })
    await nextMicrotask()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.some((entry) => entry.startsWith("at-most:150"))).toBe(true)
    engine.dispose()
  })

  it("frees every yoga node on dispose", async () => {
    const before = getLiveNodeCount()
    const engine = new LayoutEngine(VIEWPORT)
    const a = engine.createNode()
    const b = engine.createNode()
    const c = engine.createNode()
    engine.root.insertChild(a, 0)
    a.insertChild(b, 0)
    a.insertChild(c, 1)
    expect(getLiveNodeCount()).toBe(before + 4)

    b.free()
    expect(getLiveNodeCount()).toBe(before + 3)
    expect(a.children.length).toBe(1)

    engine.dispose()
    expect(getLiveNodeCount()).toBe(before)
  })
})
