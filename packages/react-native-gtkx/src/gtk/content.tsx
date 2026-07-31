// Putting React Native content into a GTK widget slot.
//
// The Adwaita primitives in this subpath are widget bindings: their children
// are widgets. React Native content is a different thing — it needs a layout
// root that runs Yoga and reports a size. These two components are that
// bridge, and they are what makes "GTK chrome around RN content" work
// anywhere, not just inside our navigators.
import {
  IntrinsicRoot,
  NestedRoot,
  type IntrinsicRootProps,
  type NestedRootProps,
} from "../components/root"

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
