// Rendering children into a NAMED SLOT of an object that is not their parent.
//
// gtkx's own `createPortal(children, container)` targets the container's
// DEFAULT slot — "children", the one a widget takes another widget through.
// Everything else an object can be given declaratively is a named slot
// reached in JSX by an element-valued PROP: a window's `Gio.ActionMap`
// (`actions`), the event controllers on a widget (`controllers`), an
// `AdwApplicationWindow`'s `breakpoints`. Those slots are what the
// reconciler routes an element-valued prop into — it wraps the prop's value
// in an internal element that carries the slot name, and that element is
// what actually places children into the named slot.
//
// So a portal whose single child is that internal element lands its children
// in a named slot of a remote object, which is what `WindowActions` and
// `WindowControllers` need: declare in the app tree, attach to the window.
//
// RC3-WORKAROUND(prop-portal): the internal element's name is spelled out
// here because @gtkx/react exports it from neither its public entry point
// nor its `/internal` subpath — only from a deep module path, which this
// package does not reach into. The bridge is the one module allowed to know
// a gtkx internal, so the knowledge is confined to this file: if the name
// ever changes, exactly one line moves. See docs/gtkx-rc3-notes.md.
import type * as GObject from "@gtkx/gi/gobject"
import { createPortal } from "@gtkx/react"
import { createElement, type FunctionComponent, type ReactNode } from "react"

// Typed as a component rather than an intrinsic tag: "gtkx:prop" is not in
// the generated JSX.IntrinsicElements map (it is not a GObject type), so
// createElement would reject the bare string.
const PROP_ELEMENT = "gtkx:prop" as unknown as FunctionComponent<{
  propName: string
  children?: ReactNode
}>

/**
 * A React portal that renders `children` into `target`'s named `slot`
 * instead of into the tree position where it is written — the declarative
 * equivalent of passing `<Target slot={children} />`, for a target the
 * declaring component does not render.
 *
 * The children stay part of the React tree where the portal element sits,
 * so context, state and effects behave exactly as they would in place.
 */
export const createSlotPortal = (
  children: ReactNode,
  target: GObject.Object,
  slot: string,
  key?: string,
): ReactNode =>
  createPortal(
    createElement(PROP_ELEMENT, { propName: slot }, children),
    target,
    key,
  )
