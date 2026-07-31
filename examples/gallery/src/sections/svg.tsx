// Svg: the component API (Path/Rect/Circle/Ellipse/Line/Polygon/Polyline,
// <G> transforms, viewBox/preserveAspectRatio, gradients, Animated-driven
// redraw) — everything drawn here goes through Gsk.Path, not a rasterized
// image. SVG **files** are a different, already-shipped feature: see the
// Media section (Image loads .svg through Gdk.Texture/librsvg).
import { useEffect, useState } from "react"
import {
  Animated,
  Circle,
  Defs,
  Easing,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Polygon,
  Polyline,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  View,
} from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  item: {
    gap: 4,
    alignItems: "center",
  },
  canvas: {
    backgroundColor: palette.cardAlt,
    borderRadius: 8,
  },
})

const Labeled = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <View style={styles.item}>
    {children}
    <Caption>{label}</Caption>
  </View>
)

// Animated.Value drives `r`/`strokeDashoffset` directly — every tick goes
// straight to the bridge's queueDraw channel, never through React (see
// docs/api.md "Svg"). This loop is the visual proof that the channel works.
const PulsingCircle = () => {
  const [radius] = useState(() => new Animated.Value(10))
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(radius, {
          toValue: 26,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(radius, {
          toValue: 10,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [radius])
  return (
    <Svg
      width={72}
      height={72}
      viewBox="0 0 72 72"
      style={styles.canvas}
    >
      <Circle
        cx={36}
        cy={36}
        r={radius}
        fill={palette.accent}
      />
    </Svg>
  )
}

const PROGRESS_RADIUS = 26
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS

// strokeDashoffset counting down draws a ring filling in clockwise — the
// same trick RN-svg progress-ring examples use, and another exercise of the
// animated-numeric-prop channel (this time on a paint prop, not geometry).
const ProgressRing = () => {
  const [dashoffset] = useState(
    () => new Animated.Value(PROGRESS_CIRCUMFERENCE),
  )
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dashoffset, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
        }),
        Animated.timing(dashoffset, {
          toValue: PROGRESS_CIRCUMFERENCE,
          duration: 0,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [dashoffset])
  return (
    <Svg
      width={72}
      height={72}
      viewBox="0 0 72 72"
      style={styles.canvas}
    >
      <Circle
        cx={36}
        cy={36}
        r={PROGRESS_RADIUS}
        fill="none"
        stroke={palette.cardAlt}
        strokeWidth={6}
      />
      <Circle
        cx={36}
        cy={36}
        r={PROGRESS_RADIUS}
        fill="none"
        stroke={palette.green}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${PROGRESS_CIRCUMFERENCE}`}
        strokeDashoffset={dashoffset}
      />
    </Svg>
  )
}

export const SvgSection = () => (
  <Section
    title="Svg"
    subtitle="Svg → RnGtkxSvgNode (Gtk.Widget) drawing with Gsk.Path/Gtk.Snapshot — vector graphics built from state, not a rasterized image (Image already loads .svg files, see Media)."
  >
    <DemoCard
      title="Basic shapes"
      hint="Path/Rect/Circle/Ellipse each fed through Gsk.Path.parse — Rect's rx/ry and Circle/Ellipse go through a small geometry helper that emits the same `d` syntax Path accepts directly"
    >
      <View style={styles.row}>
        <Labeled label="Circle">
          <Svg
            width={64}
            height={64}
            style={styles.canvas}
          >
            <Circle
              cx={32}
              cy={32}
              r={26}
              fill={palette.accent}
            />
          </Svg>
        </Labeled>
        <Labeled label="Rect + rx">
          <Svg
            width={64}
            height={64}
            style={styles.canvas}
          >
            <Rect
              x={8}
              y={14}
              width={48}
              height={36}
              rx={10}
              fill={palette.purple}
            />
          </Svg>
        </Labeled>
        <Labeled label="Ellipse">
          <Svg
            width={64}
            height={64}
            style={styles.canvas}
          >
            <Ellipse
              cx={32}
              cy={32}
              rx={28}
              ry={16}
              fill={palette.orange}
            />
          </Svg>
        </Labeled>
        <Labeled label="Polygon">
          <Svg
            width={64}
            height={64}
            style={styles.canvas}
          >
            <Polygon
              points="32,6 58,50 6,50"
              fill={palette.green}
            />
          </Svg>
        </Labeled>
        <Labeled label="fill + stroke">
          <Svg
            width={64}
            height={64}
            style={styles.canvas}
          >
            <Circle
              cx={32}
              cy={32}
              r={22}
              fill={palette.yellow}
              stroke={palette.text}
              strokeWidth={3}
            />
          </Svg>
        </Labeled>
      </View>
    </DemoCard>

    <DemoCard
      title="Line & Polyline"
      hint="stroke-only shapes — Line never accepts a fill prop at all"
    >
      <View style={styles.row}>
        <Labeled label="Line + dash">
          <Svg
            width={64}
            height={64}
            style={styles.canvas}
          >
            <Line
              x1={8}
              y1={8}
              x2={56}
              y2={56}
              stroke={palette.red}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="8,6"
            />
          </Svg>
        </Labeled>
        <Labeled label="Polyline">
          <Svg
            width={64}
            height={64}
            style={styles.canvas}
          >
            <Polyline
              points="6,50 20,14 34,42 48,10 58,32"
              fill="none"
              stroke={palette.accent}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
        </Labeled>
      </View>
    </DemoCard>

    <DemoCard
      title="<G> groups a transform over its children"
      hint='transform="translate(...) rotate(...)" — a plain SVG transform-list string, no parser of our own beyond it (Gsk.Transform.matrix2d covers matrix())'
    >
      <View style={styles.row}>
        <Labeled label="ungrouped reference">
          <Svg
            width={72}
            height={72}
            style={styles.canvas}
          >
            <Rect
              x={26}
              y={26}
              width={20}
              height={20}
              fill={palette.purple}
            />
          </Svg>
        </Labeled>
        <Labeled label='G transform="translate(36,36) rotate(35)"'>
          <Svg
            width={72}
            height={72}
            style={styles.canvas}
          >
            <G transform="translate(36,36) rotate(35)">
              <Rect
                x={-10}
                y={-10}
                width={20}
                height={20}
                fill={palette.purple}
              />
            </G>
          </Svg>
        </Labeled>
      </View>
    </DemoCard>

    <DemoCard
      title="viewBox + preserveAspectRatio"
      hint="the same 60x60 viewBox content in a wider viewport: meet letterboxes (default), slice crops to fill"
    >
      <View style={styles.row}>
        <Labeled label='100x64, "meet" (default)'>
          <Svg
            width={100}
            height={64}
            viewBox="0 0 60 60"
            style={styles.canvas}
          >
            <Circle
              cx={30}
              cy={30}
              r={26}
              fill={palette.accent}
            />
          </Svg>
        </Labeled>
        <Labeled label='100x64, "xMidYMid slice"'>
          <Svg
            width={100}
            height={64}
            viewBox="0 0 60 60"
            preserveAspectRatio="xMidYMid slice"
            style={styles.canvas}
          >
            <Circle
              cx={30}
              cy={30}
              r={26}
              fill={palette.accent}
            />
          </Svg>
        </Labeled>
      </View>
    </DemoCard>

    <DemoCard
      title="Gradients (Defs/LinearGradient/RadialGradient/Stop)"
      hint="known limitation: constructing a Gsk.ColorStop crashes in gtkx-rc2's native addon regardless of how it is built (verified 3 independent ways) — the shape below degrades to its stroke outline only, no crash, until upstream fixes it; the coordinate math is unit-tested and ready"
    >
      <Svg
        width={140}
        height={64}
        style={styles.canvas}
      >
        <Defs>
          <LinearGradient
            id="gallery-grad"
            x1={0}
            y1={0}
            x2={1}
            y2={0}
          >
            <Stop
              offset={0}
              stopColor={palette.accent}
            />
            <Stop
              offset={1}
              stopColor={palette.purple}
            />
          </LinearGradient>
        </Defs>
        <Rect
          x={8}
          y={8}
          width={124}
          height={48}
          rx={8}
          fill="url(#gallery-grad)"
          stroke={palette.text}
          strokeWidth={1}
        />
      </Svg>
    </DemoCard>

    <DemoCard
      title="Animated"
      hint="Animated.Value drives r / strokeDashoffset directly — queueDraw, never a React render (see docs/api.md)"
    >
      <View style={styles.row}>
        <Labeled label="r: Animated.Value">
          <PulsingCircle />
        </Labeled>
        <Labeled label="strokeDashoffset loop">
          <ProgressRing />
        </Labeled>
      </View>
    </DemoCard>
  </Section>
)
