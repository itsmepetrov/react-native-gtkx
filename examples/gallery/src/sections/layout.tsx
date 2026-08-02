// Layout: flexDirection, justifyContent, alignItems, gap, flexWrap,
// position: absolute, percentage sizes and aspectRatio — all computed by Yoga.
import { StyleSheet, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  track: {
    backgroundColor: palette.cardAlt,
    borderRadius: 6,
    padding: 6,
    gap: 6,
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  boxLabel: {
    color: palette.onColor,
    fontSize: 11,
    fontWeight: "700",
  },
  stretchBox: {
    borderRadius: 4,
    backgroundColor: palette.orange,
  },
  chip: {
    backgroundColor: palette.purple,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipLabel: {
    color: palette.onColor,
    fontSize: 11,
  },
  absoluteHost: {
    height: 110,
    backgroundColor: palette.cardAlt,
    borderRadius: 8,
  },
  badge: {
    position: "absolute",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: palette.orange,
  },
  badgeLabel: {
    color: palette.onColor,
    fontSize: 11,
    fontWeight: "700",
  },
  percentBar: {
    height: 20,
    borderRadius: 4,
    backgroundColor: palette.green,
    justifyContent: "center",
    paddingLeft: 6,
  },
  percentLabel: {
    color: palette.onColor,
    fontSize: 10,
    fontWeight: "700",
  },
  responsive: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  responsiveColumn: {
    // Pure flexbox responsiveness, no measurement anywhere: while two >=260px
    // columns fit they sit in a row; once narrower, the second wraps below
    // and both stretch.
    flexBasis: 260,
    flexGrow: 1,
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: palette.cardAlt,
  },
  responsiveTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
})

const Boxes = ({ count }: { count: number }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <View
        key={i}
        style={styles.box}
      >
        <Text style={styles.boxLabel}>{i + 1}</Text>
      </View>
    ))}
  </>
)

const JUSTIFY = [
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
] as const

const ALIGN = ["flex-start", "center", "flex-end", "stretch"] as const

export const LayoutSection = () => (
  <Section
    title="Layout"
    subtitle="Yoga flexbox: directions, distribution and alignment, gap, wrapping, absolute positioning, percentages and aspectRatio."
  >
    <DemoCard
      title="flexDirection"
      hint="row | row-reverse | column | column-reverse"
    >
      <Caption>row</Caption>
      <View style={[styles.track, { flexDirection: "row" }]}>
        <Boxes count={3} />
      </View>
      <Caption>row-reverse</Caption>
      <View style={[styles.track, { flexDirection: "row-reverse" }]}>
        <Boxes count={3} />
      </View>
      <Caption>column (height 120, items stacked)</Caption>
      <View style={[styles.track, { flexDirection: "column", height: 120 }]}>
        <Boxes count={3} />
      </View>
    </DemoCard>

    <DemoCard
      title="justifyContent"
      hint="distribution along the row's main axis"
    >
      {JUSTIFY.map((value) => (
        <View
          key={value}
          style={{ gap: 2 }}
        >
          <Caption>{value}</Caption>
          <View
            style={[
              styles.track,
              { flexDirection: "row", justifyContent: value },
            ]}
          >
            <Boxes count={3} />
          </View>
        </View>
      ))}
    </DemoCard>

    <DemoCard
      title="alignItems"
      hint="alignment along the cross axis of a 56-tall row; the stretch items have no height of their own — they stretch"
    >
      {ALIGN.map((value) => (
        <View
          key={value}
          style={{ gap: 2 }}
        >
          <Caption>{value}</Caption>
          <View
            style={[
              styles.track,
              {
                flexDirection: "row",
                alignItems: value,
                height: 56,
                gap: 6,
              },
            ]}
          >
            {value === "stretch" ? (
              <>
                <View style={[styles.stretchBox, { width: 28 }]} />
                <View style={[styles.stretchBox, { width: 40 }]} />
                <View style={[styles.stretchBox, { width: 28 }]} />
              </>
            ) : (
              <>
                <View style={[styles.box, { height: 16 }]} />
                <View style={[styles.box, { height: 40 }]} />
                <Boxes count={1} />
              </>
            )}
          </View>
        </View>
      ))}
    </DemoCard>

    <DemoCard
      title="gap / rowGap / columnGap"
      hint="left: gap: 4; right: columnGap: 16 + rowGap: 4 on a wrapping grid"
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View
          style={[
            styles.track,
            { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
          ]}
        >
          <Boxes count={6} />
        </View>
        <View
          style={[
            styles.track,
            {
              flex: 1,
              flexDirection: "row",
              flexWrap: "wrap",
              columnGap: 16,
              rowGap: 4,
            },
          ]}
        >
          <Boxes count={6} />
        </View>
      </View>
    </DemoCard>

    <DemoCard
      title="flexWrap"
      hint="chips wrap to the next line when the width runs out — make the window narrower"
    >
      <View style={[styles.track, { flexDirection: "row", flexWrap: "wrap" }]}>
        {[
          "Yoga",
          "GtkFixed",
          "Pango",
          "flexbox",
          "react-reconciler",
          "GTK4",
          "Adwaita",
          "wrap",
          "row",
          "column",
        ].map((label) => (
          <View
            key={label}
            style={styles.chip}
          >
            <Text style={styles.chipLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </DemoCard>

    <DemoCard
      title="Responsive columns"
      hint="flexBasis + flexGrow + flexWrap, and nothing else: drag the window narrower and the second column drops below the first"
    >
      <View style={styles.responsive}>
        <View style={styles.responsiveColumn}>
          <Text style={styles.responsiveTitle}>flexBasis: 260</Text>
          <Caption>
            The basis is the width each column ASKS for; flexGrow: 1 lets both
            share whatever is left over.
          </Caption>
        </View>
        <View style={styles.responsiveColumn}>
          <Text style={styles.responsiveTitle}>flexGrow: 1</Text>
          <Caption>
            No onLayout, no Dimensions, no media query — the wrap is the layout
            engine deciding that two bases no longer fit on one line.
          </Caption>
        </View>
      </View>
    </DemoCard>

    <DemoCard
      title="position: absolute"
      hint="badges pinned to the container corners via top/right/bottom/left"
    >
      <View style={styles.absoluteHost}>
        <View style={[styles.badge, { top: 8, left: 8 }]}>
          <Text style={styles.badgeLabel}>top-left</Text>
        </View>
        <View style={[styles.badge, { top: 8, right: 8 }]}>
          <Text style={styles.badgeLabel}>top-right</Text>
        </View>
        <View style={[styles.badge, { bottom: 8, left: 8 }]}>
          <Text style={styles.badgeLabel}>bottom-left</Text>
        </View>
        <View
          style={[
            styles.badge,
            { bottom: 8, right: 8, backgroundColor: palette.green },
          ]}
        >
          <Text style={styles.badgeLabel}>bottom-right</Text>
        </View>
      </View>
    </DemoCard>

    <DemoCard
      title="Percentage sizes"
      hint='width: "25%" | "50%" | "75%" | "100%" of the card'
    >
      {(["25%", "50%", "75%", "100%"] as const).map((width) => (
        <View
          key={width}
          style={[styles.percentBar, { width }]}
        >
          <Text style={styles.percentLabel}>{width}</Text>
        </View>
      ))}
    </DemoCard>

    <DemoCard
      title="aspectRatio"
      hint="the width is a percentage, the height is derived from aspectRatio: 1 and 16/9"
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View
          style={{
            width: "20%",
            aspectRatio: 1,
            borderRadius: 8,
            backgroundColor: palette.purple,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Caption>1 : 1</Caption>
        </View>
        <View
          style={{
            width: "40%",
            aspectRatio: 16 / 9,
            borderRadius: 8,
            backgroundColor: palette.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Caption>16 : 9</Caption>
        </View>
      </View>
    </DemoCard>
  </Section>
)
