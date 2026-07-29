// B0 spike (layout-manager epic, task 001): a GObject subclass of
// GtkLayoutManager registered ENTIRELY from JS via @gtkx/runtime registerClass —
// no native addon of our own. The codegen already ships the vfunc registry for
// LayoutManagerClass (byteOffset 136/144/152 plus ref descriptors for the out
// params), so the subclass is literally a class with measure/allocate methods.
//
// Scenario (single run; phases print markers consumed by run-vm.sh):
//   SUBCLASS  — GType registered, inheritance confirmed via typeIsA
//   MEASURE   — container measure == our rect, children minimums ignored
//   ALLOCATE  — children sit exactly at our rects (getAllocation)
//   OVERFLOW  — a child allocated past the boundary does not affect measure
//   SHRINK    — the window shrinks below the sum of children minimums
//   PERF      — 1000 synchronous allocations of a container with 50 children
//   PAINT     — fullscreen for the grim screenshot: the overflow child paints
//               outside its container over the neighbor's background
import * as Gdk from "@gtkx/gi/gdk"
import * as GLib from "@gtkx/gi/glib"
import * as Gtk from "@gtkx/gi/gtk"
import {
  getHandle,
  getInstanceType,
  registerClass,
  resolveType,
  runApplication,
  typeIsA,
  typeName,
} from "@gtkx/runtime"

type Rect = { x: number; y: number; width: number; height: number }

const HORIZONTAL = Gtk.Orientation.HORIZONTAL

let measureCalls = 0
let allocateCalls = 0

/* eslint-disable @typescript-eslint/no-unused-vars --
   vfunc signatures are positional: leading params must stay even when unused. */
class RnGtkxLayout extends Gtk.LayoutManager {
  containerWidth = 0
  containerHeight = 0
  childRects = new Map<Gtk.Widget, Rect>()

  // vfunc: minimum == natural == the engine-provided size; children are not queried.
  override measure(
    _widget: Gtk.Widget,
    orientation: Gtk.Orientation,
    _forSize: number,
  ): [number, number, number, number] {
    measureCalls += 1
    const size =
      orientation === HORIZONTAL ? this.containerWidth : this.containerHeight
    return [size, size, -1, -1]
  }

  // vfunc: every child gets exactly its rect, regardless of (width, height).
  override allocate(
    _widget: Gtk.Widget,
    _width: number,
    _height: number,
    _baseline: number,
  ): void {
    allocateCalls += 1
    for (const [child, rect] of this.childRects) {
      child.sizeAllocate(
        new Gdk.Rectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }),
        -1,
      )
    }
  }

  override getRequestMode(_widget: Gtk.Widget): Gtk.SizeRequestMode {
    return Gtk.SizeRequestMode.CONSTANT_SIZE
  }
}

// An explicit typeName is mandatory: the bundler minifies class names and
// registerClass derives the GType name from klass.name by default.
/* eslint-enable @typescript-eslint/no-unused-vars */
registerClass(RnGtkxLayout, { typeName: "RnGtkxLayout" })

const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${label} ${ok ? "OK" : "FAIL"} ${detail}`)
}

const LONG = "антидисестаблишментарианизм-суперкалифрагилистик-экспиалидоушес"

const app = new Gtk.Application({ applicationId: "dev.rngtkx.spike.layout" })

app.on("activate", () => {
  // --- SUBCLASS ---------------------------------------------------------
  const manager = new RnGtkxLayout()
  const ourType = getInstanceType(manager)
  const parentType = resolveType("libgtk-4.so.1", "gtk_layout_manager_get_type")
  check(
    "SUBCLASS",
    typeIsA(ourType, parentType) && typeName(ourType) === "RnGtkxLayout",
    `type=${typeName(ourType)} isA(LayoutManager)=${typeIsA(ourType, parentType)}`,
  )

  const window = new Gtk.ApplicationWindow({ application: app })
  window.setDefaultSize(640, 480)

  // The outer box keeps its stock BoxLayout and grants the inner one its
  // natural size — leaving "foreign" territory to the right for the PAINT phase.
  const outer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL })
  const inner = new Gtk.Box({})
  const labelA = new Gtk.Label({ label: LONG })
  const labelB = new Gtk.Label({ label: LONG })
  const overflowChild = new Gtk.Label({ label: "██████████" })
  inner.append(labelA)
  inner.append(labelB)
  inner.append(overflowChild)
  // IMPORTANT: the manager is installed AFTER append — GtkBox.append does not
  // touch layout children, so the swap is safe (unlike GtkFixed.put, which
  // demands a GtkFixedLayoutChild from the current manager).
  inner.setLayoutManager(manager)
  manager.containerWidth = 300
  manager.containerHeight = 200
  manager.childRects.set(labelA, { x: 10, y: 10, width: 120, height: 30 })
  manager.childRects.set(labelB, { x: 150, y: 10, width: 120, height: 30 })
  // 40px past the container's right edge (300): x+width = 340.
  manager.childRects.set(overflowChild, {
    x: 280,
    y: 60,
    width: 60,
    height: 30,
  })
  outer.append(inner)
  window.setChild(outer)
  window.present()

  const phase2 = (): boolean => {
    // --- MEASURE --------------------------------------------------------
    const [minH, natH] = inner.measure(Gtk.Orientation.HORIZONTAL, -1)
    const [minV, natV] = inner.measure(Gtk.Orientation.VERTICAL, -1)
    const [labelMin] = labelA.measure(Gtk.Orientation.HORIZONTAL, -1)
    check(
      "MEASURE",
      minH === 300 && natH === 300 && minV === 200 && natV === 200,
      `h=[${minH},${natH}] v=[${minV},${natV}] labelMin=${labelMin} calls=${measureCalls}`,
    )

    // --- ALLOCATE -------------------------------------------------------
    const a = labelA.getAllocation()
    const b = labelB.getAllocation()
    const o = overflowChild.getAllocation()
    const rectOf = (r: Gdk.Rectangle): string =>
      `${r.x},${r.y},${r.width},${r.height}`
    check(
      "ALLOCATE",
      a.x === 10 &&
        a.y === 10 &&
        a.width === 120 &&
        a.height === 30 &&
        b.x === 150 &&
        o.x === 280 &&
        o.width === 60,
      `a=${rectOf(a)} b=${rectOf(b)} o=${rectOf(o)} calls=${allocateCalls}`,
    )

    // --- OVERFLOW (logical part) ----------------------------------------
    const [minAfter, natAfter] = inner.measure(Gtk.Orientation.HORIZONTAL, -1)
    check(
      "OVERFLOW",
      minAfter === 300 && natAfter === 300 && o.x + o.width > 300,
      `measureAfter=[${minAfter},${natAfter}] childRight=${o.x + o.width}`,
    )

    // --- SHRINK ---------------------------------------------------------
    // Each label demands labelMin (hundreds of px); our measure says 160.
    // If the ratchet were alive, the window would refuse to shrink below
    // the sum of the labels' minimums.
    manager.containerWidth = 160
    manager.containerHeight = 120
    inner.queueResize()
    window.setDefaultSize(200, 150)
    return true
  }

  const phase3 = (): boolean => {
    const w = window.getWidth()
    const h = window.getHeight()
    check(
      "SHRINK",
      w > 0 && w <= 220 && h > 0 && h <= 170,
      `window=${w}x${h} (requested 200x150; label minimums are far larger)`,
    )

    // --- PERF -----------------------------------------------------------
    const perfBox = new Gtk.Box({})
    const perfManager = new RnGtkxLayout()
    const perfChildren: Gtk.Widget[] = []
    for (let index = 0; index < 50; index += 1) {
      const child = new Gtk.Label({ label: `item ${index}` })
      perfBox.append(child)
      perfChildren.push(child)
    }
    perfBox.setLayoutManager(perfManager)
    perfManager.containerWidth = 400
    perfManager.containerHeight = 600
    perfChildren.forEach((child, index) => {
      perfManager.childRects.set(child, {
        x: 8,
        y: index * 12,
        width: 384,
        height: 12,
      })
    })
    window.setChild(perfBox)

    const started = Number(GLib.getMonotonicTime())
    for (let pass = 0; pass < 1000; pass += 1) {
      const width = 400 + (pass % 2) * 16
      perfManager.containerWidth = width
      perfChildren.forEach((child) => {
        const rect = perfManager.childRects.get(child)
        if (rect) {
          rect.width = width - 16
        }
      })
      perfBox.sizeAllocate(
        new Gdk.Rectangle({ x: 0, y: 0, width, height: 600 }),
        -1,
      )
    }
    const elapsedMs = (Number(GLib.getMonotonicTime()) - started) / 1000
    console.log(
      `PERF ${elapsedMs.toFixed(1)}ms / 1000 allocations x 50 children (${allocateCalls} vfunc calls)`,
    )

    // --- PAINT (for grim) -----------------------------------------------
    window.setChild(outer)
    manager.containerWidth = 300
    manager.containerHeight = 200
    inner.queueResize()
    window.fullscreen()
    console.log(
      "PAINT ready (fullscreen; overflow block at x=280..340, y=60..90)",
    )
    return true
  }

  const finish = (): boolean => {
    console.log(`SPIKE-DONE handle=${String(getHandle(manager) !== null)}`)
    if (process.env.SPIKE_EXIT === "1") {
      app.quit()
    }
    return false
  }

  // Schedule: 0.7s to settle layout → check phases; after PAINT keep the
  // fullscreen up for 4s so the harness can take the grim shot, then exit.
  GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 700, () => {
    phase2()
    GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 700, () => {
      phase3()
      GLib.timeoutAdd(GLib.PRIORITY_DEFAULT, 4000, () => finish())
      return false
    })
    return false
  })
})

runApplication(app)
