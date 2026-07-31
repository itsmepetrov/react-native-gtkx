// Putting React Native content into a GTK widget slot.
//
// The Adwaita primitives in this subpath are widget bindings: their children
// are widgets. React Native content is a different thing — it needs a layout
// root that runs Yoga and reports a size. These two components are that
// bridge, and they are what makes "GTK chrome around RN content" work
// anywhere, not just inside our navigators.
import type { ReactNode } from "react"
// View and StyleSheet come from this package's own modules, never from the
// bare public specifier: this package IS that module on the linux platform,
// so importing it here would alias back to itself and Metro would try to
// bundle it (tests/unit/metro-preset.test.ts pins that down).
import { HostNodeContext } from "../components/host-node"
import {
  IntrinsicRoot,
  NestedRoot,
  type IntrinsicRootProps,
  type NestedRootProps,
} from "../components/root"
import { View } from "../components/view"
import { StyleSheet } from "../style/index"

/**
 * React Native content that FILLS its slot.
 *
 * Use it for the body of a page, a split-view pane, a dialog — anywhere the
 * widget hands out a rectangle and the RN tree should lay out inside it.
 *
 * ```tsx
 * <NavigationStackPage tag="home" title="Home">
 *   <SlotContent>
 *     <View style={{ flex: 1 }}>…</View>
 *   </SlotContent>
 * </NavigationStackPage>
 * ```
 */
export const SlotContent = NestedRoot
export type SlotContentProps = NestedRootProps

/**
 * React Native content SIZED BY ITSELF.
 *
 * The content's own Yoga size becomes the slot size, which is what a
 * HeaderBar slot, a toolbar button area or a list row needs — the widget asks
 * "how big are you?" and the RN tree answers.
 *
 * ```tsx
 * <AdwHeaderBar
 *   start={<IntrinsicContent><SearchField /></IntrinsicContent>}
 * />
 * ```
 */
export const IntrinsicContent = IntrinsicRoot
export type IntrinsicContentProps = IntrinsicRootProps

/**
 * A HeaderBar slot's React Native content.
 *
 * {@link IntrinsicContent} on its own is not enough for a header slot: a
 * Yoga root defaults to React Native's `column` direction, so two buttons
 * handed to `headerLeft` stack vertically and push the HeaderBar to twice
 * its height — with the window controls left stranded on the lower row.
 * A GTK header slot is horizontal by definition (`gtk_header_bar_pack_start`
 * appends along one axis), and react-navigation's `headerLeft`/`headerRight`
 * mean a horizontal cluster on every other platform too, so the row is the
 * correct default rather than a workaround.
 *
 * The 6px gap matches AdwHeaderBar's own spacing between packed children,
 * so a slot built from RN content sits flush with buttons packed natively
 * beside it.
 */
export const HeaderSlotContent = ({ children }: { children?: ReactNode }) => (
  <IntrinsicContent>
    <View style={headerSlotStyles.row}>{children}</View>
  </IntrinsicContent>
)

const headerSlotStyles = StyleSheet.create({
  // alignSelf keeps the row HUGGING its buttons. A Yoga root stretches its
  // children across its own width by default, which a HeaderBar reads back
  // as "this slot wants all of it" — the centred title then sits off centre
  // and packed buttons drift apart. A header slot is content-sized on every
  // platform; this is what says so.
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
  },
})

/**
 * A slot whose children are GTK WIDGETS, not React Native content.
 *
 * Clears the enclosing layout root so the widgets from `react-native-gtkx/gtk`
 * and `/adw` render bare — the same thing they already do outside any React
 * Native tree. Without this, a widget under an ancestor root is a Yoga LEAF:
 * it is measured for its own natural size and its own widget children never
 * reach it, which shows up as a container that renders its first child and
 * silently drops the rest.
 *
 * Use it wherever GTK chrome should own the layout — a page body that is a
 * `GtkScrolledWindow` around a `.boxed-list`, say. React Native content
 * nested further down opts back in with {@link SlotContent}.
 */
export const WidgetContent = ({ children }: { children?: ReactNode }) => (
  <HostNodeContext.Provider value={null}>{children}</HostNodeContext.Provider>
)
