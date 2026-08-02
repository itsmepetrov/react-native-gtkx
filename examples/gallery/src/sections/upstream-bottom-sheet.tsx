// The REAL `@gorhom/bottom-sheet` (5.2.14), dragged between its detents by a
// pointer.
//
// Same terms as the drawer next door: no Linux build, no fork and no shim in
// this repo — the published npm tarball, and everything it imports
// (`react-native`, `react-native-reanimated`, `react-native-worklets`,
// `react-native-gesture-handler`) is answered by react-native-gtkx. Unlike
// the drawer it needs no vite plugin, only a name in `ssr.noExternal`
// (vite.config.ts): `gtkx dev` hands every bare dependency straight to Node,
// and this one imports `react-native` at module scope.
//
// It is also the reason four `react-native` core exports and the RNGH
// `Touchable` family exist here at all: `findNodeHandle`, `LogBox`,
// `Keyboard` and `VirtualizedList` are what it stopped the build on, and it
// re-exports `TouchableOpacity`/`TouchableHighlight`/
// `TouchableWithoutFeedback` from its own public entry on every platform
// except iOS — upstream's export rather than an app's choice. See
// docs/research/gesture-detector.md.
//
// THE HONEST HALF. The sheet drags and snaps; its own scrollable receives
// zero scroll events, and both the second card and the sheet's own header
// say so on screen, with a live count rather than a claim. gorhom bounds
// the list with an animated `height` — `contentMaskContainerAnimatedStyle` in
// `BottomSheetContent` — and a driven size on this platform is an override in
// the rect store that is deliberately never written back into Yoga, which is
// what buys 7.1 µs a frame instead of 496. The container therefore allocates
// and clips correctly while the list, for layout, sees no bound at all and
// grows to its content. A screen that showed a sheet and left that unsaid
// would be demonstrating a broken list as if it worked.
//
// This section does NOT scroll (see src/index.tsx): the sheet is dragged by
// its handle and by its content, and an enclosing ScrollView would be
// arbitrating against both.
//
// Nothing here uses the library's own colors. gorhom's default background is
// `white` and its handle indicator `rgba(0, 0, 0, 0.75)` — a hand-picked pair
// that can only be right on one theme — so `backgroundStyle` and
// `handleIndicatorStyle` carry the gallery's PlatformColor palette instead.
// The sheet takes `palette.overlay` rather than `palette.card`, and that
// distinction was found by dragging: Adwaita's card colour is a translucent
// tint on the dark theme, so the first version of this screen let the cards
// underneath read straight through the sheet mid-drag.
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet"
import { useCallback, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Caption, DemoCard, palette, Section, Status } from "../ui"

// Exactly two detents, so the top one IS gorhom's EXTENDED state — the state
// in which the library releases its own scroll lock. That matters for what
// the second card claims: the list is not merely pinned by a lock that is
// doing its job, it receives nothing even where the lock is off. With
// `enableDynamicSizing` left on, a content taller than the top detent adds a
// THIRD detent above it and the sheet at 60% would not be extended at all.
//
// 60% rather than something taller so the first card's readout stays visible
// at BOTH detents — a snap you can see the sheet make and the label agree
// with is worth more than a sheet that swallows the page.
const SNAP_POINTS = ["32%", "60%"]

// Long enough to overflow the sheet at BOTH detents: a list with nowhere to
// scroll cannot tell "it does not scroll" apart from "there was nothing to
// scroll to".
const ROWS = Array.from({ length: 18 }, (_, index) => `Row ${index + 1}`)

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, backgroundColor: palette.window },
  sheetBackground: {
    backgroundColor: palette.overlay,
    borderWidth: 1,
    borderColor: palette.cardAlt,
  },
  sheetHandle: { backgroundColor: palette.textDim, width: 56 },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  sheetTitle: { fontSize: 15, fontWeight: "700", color: palette.text },
  row: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: palette.cardAlt,
  },
  rowText: { fontSize: 13, color: palette.text },
})

export const UpstreamBottomSheetSection = () => {
  const [detent, setDetent] = useState(0)
  // Scroll events the sheet's OWN scrollable received, counted rather than
  // asserted: the screen stops claiming anything the moment the number moves,
  // which is what the fix behind it will do. The handler goes through
  // gorhom's own composition — `useScrollHandler` wraps it in the same
  // `useAnimatedScrollHandler` its scroll lock lives in and calls it with
  // `runOnJS` — so a zero here is a zero on the library's path, not on a
  // handler bolted alongside it.
  const [scrolls, setScrolls] = useState(0)
  const onScroll = useCallback(() => {
    setScrolls((count) => count + 1)
  }, [])

  return (
    // Upstream's own quick start wraps the app in this, and on this platform
    // it is the one RNGH symbol that is implemented rather than refused —
    // see src/gesture-handler-compat/index.tsx.
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.content}>
        <Section
          title="Upstream bottom sheet"
          subtitle="@gorhom/bottom-sheet 5.2.14, straight from npm: a real draggable sheet over this platform's Reanimated, worklets and gesture-handler compat surfaces."
        >
          <DemoCard
            title="Drag the handle up and down"
            hint="Press the grip at the top of the sheet and pull. The sheet has two detents and springs to whichever one the release is heading for; the sheet body drags it too."
          >
            <Status>
              {detent === 0 ? "detent 1 of 2 — 32%" : "detent 2 of 2 — 60%"}
            </Status>
            <Caption>
              Half-open frames are the proof: the sheet follows the pointer
              rather than jumping when a prop changes, and the spring that
              finishes the gesture is the library&apos;s own. gorhom&apos;s
              whole gesture configuration is honoured — two Pan chains, two
              Native, one Tap, with simultaneousWithExternalGesture and
              requireExternalGestureToFail between them — over Reanimated&apos;s
              shared values and this platform&apos;s worklet runtime.
            </Caption>
          </DemoCard>

          <DemoCard
            title="The list inside the sheet does not scroll yet"
            hint="Put the pointer over the rows and turn the wheel: the counter in the sheet stays at zero, at either detent."
          >
            <Caption>
              gorhom bounds that list with an animated height on its
              content-mask container, and a driven size here lives as an
              override in the rect store that is never written back into Yoga —
              so the sheet allocates and clips at the right size while its list,
              for layout, has no bound at all, grows to its content, and never
              becomes a viewport with a scroll range to move through. That is
              the cost of the cheap animated-size path (7.1 µs a frame instead
              of 496 at 300 children), and it is being worked, not hidden: see
              docs/research/animated-size.md. Everything above it is already
              here — gorhom&apos;s scroll lock registers its handlers and calls
              Reanimated&apos;s scrollTo to pin the list, and both halves run
              the moment an event arrives. The control is what keeps that zero
              honest: the same unstyled FlatList in a parent that IS bounded
              scrolls perfectly well — the Lists section next door, and
              spike/core-exports, which measures the two side by side.
            </Caption>
          </DemoCard>
        </Section>
      </View>

      <BottomSheet
        index={0}
        snapPoints={SNAP_POINTS}
        enableDynamicSizing={false}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        onChange={setDetent}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>BottomSheetFlatList</Text>
          {/* The readout lives next to the thing it measures, and it counts
              events rather than announcing a verdict — the sentence below
              stops being true the moment the number moves. */}
          <Status>
            {scrolls === 0
              ? "0 scroll events have reached this list"
              : `${scrolls} scroll events have reached this list`}
          </Status>
          <Caption>
            18 rows and no style of its own — the shape a library hands its list
            down in — clipped rather than scrollable, because gorhom bounds it
            with an animated height and a driven size here is an override in the
            rect store that Yoga never sees, so the sheet clips at the right
            size while the list, for layout, has no bound and grows to its
            content.
          </Caption>
        </View>
        <BottomSheetFlatList
          data={ROWS}
          keyExtractor={(item: string) => item}
          onScroll={onScroll}
          renderItem={({ item }: { item: string }) => (
            <View style={styles.row}>
              <Text style={styles.rowText}>{item}</Text>
            </View>
          )}
        />
      </BottomSheet>
    </GestureHandlerRootView>
  )
}
