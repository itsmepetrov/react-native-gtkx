// Attaching a GTK event controller to a component written in React Native.
//
// WHY this is a component in THIS subpath rather than a `controllers` prop
// on `View`. A `View`'s ref is a `ViewHandle` — measure/measureInWindow/
// measureLayout — and that is right: React Native's contract says nothing
// about widgets, and an app that reaches through the ref to a `Gtk.Widget`
// has pinned every internal of this platform as public API. But GTK carries
// real behaviour that no style and no RN prop expresses — drag-and-drop
// above all — and before this component there was simply no way to reach it
// from a row written in React Native (see
// docs/research/react-native-first-showcase.md, and `examples/tasks-nav`'s
// rows, which could not be rewritten because of it).
//
// A `controllers` prop on `View`/`Pressable` would have been three lines.
// It was rejected because it puts a GTK concept on the two components an
// app shares with iOS and Android, imported from the PORTABLE entry point:
// the file would still compile everywhere, the prop would be ignored off
// Linux, and the feature would vanish with no diagnostic. The import is the
// signal on this platform — `react-native-gtkx/gtk` is the line an app
// knows it is crossing — and a prop on `View` throws that signal away. An
// ELEMENT, by contrast, is something an RN developer already knows how to
// put behind a `Platform.OS` check or a `.linux.tsx` split, and its absence
// is visible in the tree.
//
// The shape is not new here: `WindowActions`/`WindowControllers` next door
// already mean "declare in the app tree, attach to the window". This means
// "declare in the app tree, attach to the enclosing view" — same portal,
// same mount/unmount lifecycle, one level down. Nothing was added to
// `View`, `Pressable`, `ScrollView` or `Animated.View` to make it work on
// all four: each already publishes its widget through HostNodeContext.
import { useContext, useEffect, useState, type ReactNode } from "react"
import { HostNodeContext } from "../components/host-node"
import { createSlotPortal, type Gtk } from "../gtkx/bridge/index"

export type ControllersProps = {
  /** `Gtk.EventController` elements — `GtkDragSource`, `GtkDropTarget`,
   *  `GtkShortcutController`, and anything else gtkx exposes as one. */
  children?: ReactNode
}

/**
 * Attaches its children as event controllers on the widget of the enclosing
 * React Native component.
 *
 * ```tsx
 * // Controllers and GtkDragSource are both exported by this subpath.
 * // (Not written as a real import line: the metro-preset test scans src for
 * // bare imports with a regex, and an import-shaped sentence in a doc
 * // comment reads to it exactly like a real one — see components/host-node.)
 *
 * <Pressable onPress={open}>
 *   <Controllers>
 *     <GtkDragSource actions={Gdk.DragAction.MOVE} onPrepare={…} />
 *   </Controllers>
 *   <Text>{task.title}</Text>
 * </Pressable>
 * ```
 *
 * It renders nothing where it sits: like `WindowControllers`, it is a
 * portal in React's own sense, so the children keep the context, state and
 * effects they would have at that position while the attachment lands on
 * the widget. They are removed when this component unmounts.
 *
 * Works inside `View`, `Pressable`, `ScrollView`, `Animated.View` and
 * `Root` — every component that owns a widget and hands it down. Inside a
 * GTK widget's own slot there is no enclosing React Native component, and
 * nothing is attached: pass `controllers={…}` to the widget itself there,
 * which is the prop this exists to substitute for.
 *
 * **Linux-only, and the import says so.** Guard it with `Platform.OS` or
 * split the file if the same screen also builds for iOS or Android.
 */
export const Controllers = ({ children }: ControllersProps): ReactNode => {
  const host = useContext(HostNodeContext)
  // Captured in a PASSIVE effect, not a layout effect, and that is forced:
  // React attaches host refs bottom-up, so the enclosing `<ViewBox
  // ref={…}>`'s ref is still null while this child's layout effects run on
  // the first mount. Passive effects run after the whole commit, by which
  // time it is set. The cost is that controllers attach one commit late —
  // unobservable for an event controller (no pointer reaches a widget in
  // its first frame), and the same delay `WindowActions` already documents
  // for the window.
  //
  // react-hooks/set-state-in-effect is disabled rather than worked around:
  // the rule guards against effects that derive state from PROPS, which
  // should be computed during render instead. This derives it from an
  // imperative handle that does not exist until after the commit — the one
  // case an effect is the only place it can come from. It runs once and
  // settles (the setter bails on an unchanged value), so there is no
  // cascade for the rule to be protecting against.
  const [widget, setWidget] = useState<Gtk.Widget | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setWidget(host?.widgetRef.current ?? null), [host])

  if (widget === null) {
    return null
  }
  return createSlotPortal(children, widget, "controllers")
}
