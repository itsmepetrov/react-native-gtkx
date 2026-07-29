import { css } from "@gtkx/css"
import * as Gtk from "@gtkx/gi/gtk"
import {
  GtkApplication,
  GtkApplicationWindow,
  GtkFixed,
  GtkLabel,
} from "@gtkx/jsx/gtk"
import { quit } from "@gtkx/react"
import {
  createRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import {
  buildYogaTree,
  computeLayout,
  type LaidNode,
  type Spec,
} from "./yoga-bridge.js"

const WIN_W = 1280
const WIN_H = 800

const boxCss = (bg: string): string => css`
  background: ${bg};
  border-radius: 8px;
`

type WidgetRefs = Map<string, RefObject<Gtk.Widget | null>>

const collectKeys = (s: Spec, out: string[] = []): string[] => {
  out.push(s.key)
  ;(s.children ?? []).forEach((c) => collectKeys(c, out))
  return out
}

const flatten = (l: LaidNode, out: LaidNode[] = []): LaidNode[] => {
  out.push(l)
  l.children.forEach((c) => flatten(c, out))
  return out
}

const makeRefs = (spec: Spec): WidgetRefs => {
  const m: WidgetRefs = new Map()
  collectKeys(spec).forEach((k) => m.set(k, createRef<Gtk.Widget | null>()))
  return m
}

// The core of the future layout engine: push Yoga rects into GtkFixed coordinates.
const applyPositions = (laid: LaidNode, refs: WidgetRefs): void => {
  const parent = refs.get(laid.spec.key)?.current
  if (parent instanceof Gtk.Fixed) {
    for (const child of laid.children) {
      const widget = refs.get(child.spec.key)?.current
      if (widget) {
        parent.move(widget, child.rect.x, child.rect.y)
      }
    }
  }
  laid.children.forEach((c) => applyPositions(c, refs))
}

const LaidBox = ({ laid, refs }: { laid: LaidNode; refs: WidgetRefs }) => {
  const { spec, rect, children } = laid
  const ref = refs.get(spec.key)

  if (spec.text !== undefined) {
    return (
      <GtkLabel
        ref={ref as RefObject<Gtk.Label | null> | undefined}
        label={spec.text}
        wrap
        xalign={0}
        yalign={0}
        widthRequest={Math.round(rect.w)}
        heightRequest={Math.round(rect.h)}
      />
    )
  }

  return (
    <GtkFixed
      ref={ref as RefObject<Gtk.Fixed | null> | undefined}
      widthRequest={Math.round(rect.w)}
      heightRequest={Math.round(rect.h)}
      cssClasses={spec.bg ? [boxCss(spec.bg)] : []}
    >
      {children.map((c) => (
        <LaidBox
          key={c.spec.key}
          laid={c}
          refs={refs}
        />
      ))}
    </GtkFixed>
  )
}

const useAccuracyReport = (
  laid: LaidNode,
  refs: WidgetRefs,
  tag: string,
  textOnly: boolean,
) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      let max = 0
      let checked = 0
      for (const l of flatten(laid)) {
        if (textOnly && l.spec.text === undefined) {
          continue
        }
        const w = refs.get(l.spec.key)?.current
        if (!w) {
          continue
        }
        checked += 1
        const dw = Math.abs(w.getAllocatedWidth() - Math.round(l.rect.w))
        const dh = Math.abs(w.getAllocatedHeight() - Math.round(l.rect.h))
        const delta = Math.max(dw, dh)
        max = Math.max(max, delta)
        if (delta > 1) {
          console.log(
            `  delta key=${l.spec.key} yoga=${Math.round(l.rect.w)}x${Math.round(l.rect.h)} gtk=${w.getAllocatedWidth()}x${w.getAllocatedHeight()}`,
          )
        }
      }
      console.log(`${tag} checked=${checked} maxDelta=${max}`)
      if (process.env.SPIKE_EXIT === "1") {
        quit()
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [laid, refs, tag, textOnly])
}

const useLaidScenario = (spec: Spec) => {
  const laid = useMemo(() => {
    const tree = buildYogaTree(spec)
    const result = computeLayout(tree, spec, WIN_W, WIN_H)
    tree.free()
    return result
  }, [spec])
  const refs = useMemo(() => makeRefs(spec), [spec])

  useLayoutEffect(() => {
    applyPositions(laid, refs)
  }, [laid, refs])

  return { laid, refs }
}

// --- scenario: static -------------------------------------------------------

const LOREM =
  "React Native components rendered as real GTK4 widgets: Yoga computes the flexbox layout, " +
  "GtkFixed applies the coordinates, Pango measures the text. This label must wrap correctly."

const staticSpec: Spec = {
  key: "root",
  style: { flexDirection: "column", padding: 12, gap: 12 },
  bg: "#241f31",
  children: [
    {
      key: "header",
      style: {
        height: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 12,
      },
      bg: "#3d3846",
      children: [
        { key: "h-title", text: "react-native-gtkx spike" },
        { key: "h-badge", style: { width: 90, height: 28 }, bg: "#26a269" },
      ],
    },
    {
      key: "body",
      style: { flex: 1, flexDirection: "row", gap: 12 },
      children: [
        {
          key: "sidebar",
          style: { width: 220, flexDirection: "column", gap: 8, padding: 8 },
          bg: "#3d3846",
          children: Array.from({ length: 5 }, (_, i) => ({
            key: `s-${i}`,
            style: { height: 36 },
            bg: i === 0 ? "#1c71d8" : "#5e5c64",
          })),
        },
        {
          key: "content",
          style: { flex: 1, flexDirection: "column", gap: 12, padding: 12 },
          bg: "#3d3846",
          children: [
            { key: "text-1", text: LOREM },
            {
              key: "cards",
              style: { flexDirection: "row", gap: 12 },
              children: Array.from({ length: 3 }, (_, i) => ({
                key: `card-${i}`,
                style: { flex: 1, height: 120, padding: 10 },
                bg: "#613583",
                children: [
                  {
                    key: `card-text-${i}`,
                    text: `Card #${i + 1} with wrapped text inside a flex row`,
                  },
                ],
              })),
            },
            { key: "spacer", style: { flex: 1 } },
            {
              key: "footer",
              style: {
                height: 40,
                alignItems: "center",
                justifyContent: "center",
              },
              bg: "#a51d2d",
              children: [{ key: "f-text", text: "footer / centered" }],
            },
          ],
        },
      ],
    },
  ],
}

const StaticScenario = () => {
  const { laid, refs } = useLaidScenario(staticSpec)
  useAccuracyReport(laid, refs, "ACCURACY", false)
  return (
    <LaidBox
      laid={laid}
      refs={refs}
    />
  )
}

// --- scenario: measure ------------------------------------------------------

const measureSpec: Spec = {
  key: "mroot",
  style: { flexDirection: "column", gap: 8, padding: 8 },
  children: [120, 200, 320, 480].flatMap((w, wi) =>
    [
      "short",
      "a somewhat longer text that should wrap at narrow widths",
      LOREM,
    ].map((text, ti) => ({
      key: `m-${wi}-${ti}`,
      style: { width: w },
      children: [{ key: `m-${wi}-${ti}-t`, text }],
    })),
  ),
}

const MeasureScenario = () => {
  const { laid, refs } = useLaidScenario(measureSpec)
  useAccuracyReport(laid, refs, "MEASURE", true)
  return (
    <LaidBox
      laid={laid}
      refs={refs}
    />
  )
}

// --- scenario: perf ---------------------------------------------------------

const yogaReflowBench = (): string => {
  const spec: Spec = {
    key: "proot",
    style: { flexDirection: "column", padding: 4, gap: 2 },
    children: Array.from({ length: 25 }, (_, r) => ({
      key: `row-${r}`,
      style: { flexDirection: "row", gap: 2, height: 30 },
      children: Array.from({ length: 19 }, (_, c) => ({
        key: `cell-${r}-${c}`,
        style: { flex: 1 },
      })),
    })),
  }
  const tree = buildYogaTree(spec)
  tree.root.calculateLayout(WIN_W, WIN_H, 2)

  const passes = 100
  const t0 = performance.now()
  for (let i = 0; i < passes; i += 1) {
    const row = tree.nodes.get(`row-${i % 25}`)
    row?.setHeight(30 + (i % 7))
    tree.root.calculateLayout(WIN_W, WIN_H, 2)
  }
  const avg = (performance.now() - t0) / passes
  tree.free()
  return `yoga-reflow-500-nodes avg=${avg.toFixed(3)}ms`
}

const ANIM_N = 100
const ANIM_SECONDS = 5

const itemPos = (i: number, t: number): { x: number; y: number } => ({
  x: 40 + (i % 10) * 115 + 40 * Math.sin(t * 2 + i),
  y: 40 + Math.floor(i / 10) * 70 + 30 * Math.cos(t * 2 + i),
})

const PerfScenario = () => {
  const [mode, setMode] = useState<"react" | "direct" | "done">("react")
  const [phase, setPhase] = useState(0)
  const fixedRef = useRef<Gtk.Fixed | null>(null)
  const itemRefs = useMemo(
    () => Array.from({ length: ANIM_N }, () => createRef<Gtk.Label | null>()),
    [],
  )
  const frames = useRef(0)
  const started = useRef<number | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  const moveAll = (t: number): void => {
    const fixed = fixedRef.current
    if (!fixed) {
      return
    }
    for (let i = 0; i < ANIM_N; i += 1) {
      const widget = itemRefs[i].current
      if (widget) {
        const { x, y } = itemPos(i, t)
        fixed.move(widget, x, y)
      }
    }
  }

  // React-driven mode: state change → render → layout effect applies coordinates.
  useLayoutEffect(() => {
    if (modeRef.current === "react") {
      moveAll(phase)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    console.log(`PERF ${yogaReflowBench()}`)

    const fixed = fixedRef.current
    if (!fixed) {
      return
    }
    moveAll(0)

    const tickId = fixed.addTickCallback((_w, clock) => {
      const now = Number(clock.getFrameTime()) / 1_000_000
      if (started.current === null) {
        started.current = now
        frames.current = 0
      }
      const t = now - started.current
      frames.current += 1

      if (t >= ANIM_SECONDS) {
        const fps = frames.current / t
        const current = modeRef.current
        console.log(
          `PERF anim-${current}-${ANIM_N}-widgets fps=${fps.toFixed(1)}`,
        )
        if (current === "react") {
          started.current = null
          setMode("direct")
          return true
        }
        console.log("PERF done")
        if (process.env.SPIKE_EXIT === "1") {
          quit()
        }
        setMode("done")
        return false
      }

      if (modeRef.current === "react") {
        setPhase(t)
      } else if (modeRef.current === "direct") {
        moveAll(t)
      }
      return true
    })

    return () => {
      fixedRef.current?.removeTickCallback(tickId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <GtkFixed
      ref={fixedRef}
      widthRequest={WIN_W}
      heightRequest={WIN_H}
      cssClasses={[boxCss("#241f31")]}
    >
      {Array.from({ length: ANIM_N }, (_, i) => (
        <GtkLabel
          key={i}
          ref={itemRefs[i]}
          label={`•${i}`}
          cssClasses={[boxCss("#1c71d8")]}
          widthRequest={40}
          heightRequest={24}
        />
      ))}
    </GtkFixed>
  )
}

// --- app --------------------------------------------------------------------

const scenario = process.env.SPIKE ?? "static"

const Scenario = () => {
  if (scenario === "perf") {
    return <PerfScenario />
  }
  if (scenario === "measure") {
    return <MeasureScenario />
  }
  return <StaticScenario />
}

export const App = () => (
  <GtkApplication>
    <GtkApplicationWindow
      title={`spike: ${scenario}`}
      defaultWidth={WIN_W}
      defaultHeight={WIN_H}
      onCloseRequest={quit}
    >
      <Scenario />
    </GtkApplicationWindow>
  </GtkApplication>
)
