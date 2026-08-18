// The core door onto gtkx: everything the RN core (components, APIs,
// gesture-handler, reanimated, dnd) needs, and NOTHING from @gtkx/gi/adw or
// @gtkx/jsx/adw — see .claude/epics/adw-optional/001.md. This is what makes
// `libraries: ["Gtk-4.0"]` alone buildable: an app that never declares
// "Adw-1" has no "./adw" entry in either package's codegen store at all, so
// a static import of either specifier fails the whole build regardless of
// whether it is ever reached at runtime. ./adw.ts is the one place that
// still reaches for them, behind a probe (adwAvailable()); its absence
// surfaces as a named throw, not a build failure.
//
// Caveats baked into this surface (catalogued in docs/gtkx-1.2-notes.md):
// - 64-bit FFI values arrive as BigInt → normalize with toNumber() at this boundary

// import-then-export (not `export * as`): the latter is the one syntax the
// stock @react-native/babel-preset cannot transform — this form keeps
// consumer apps on their unmodified RN Babel config.
import * as Gdk from "@gtkx/gi/gdk"
import * as Gio from "@gtkx/gi/gio"
import * as GLib from "@gtkx/gi/glib"
import * as GObject from "@gtkx/gi/gobject"
import * as Graphene from "@gtkx/gi/graphene"
import * as Gsk from "@gtkx/gi/gsk"
import * as Gtk from "@gtkx/gi/gtk"
import * as Pango from "@gtkx/gi/pango"

export { Gdk, Gio, GLib, GObject, Graphene, Gsk, Gtk, Pango }

// GtkApplication and GtkGestureClick are not Gtk.Widget subclasses (an
// application object and an event controller, respectively), so the widget
// surface generator never sees them — kept here by hand, same as before it
// existed.
export { GtkApplication, GtkGestureClick } from "@gtkx/jsx/gtk"

// Auxiliary gtkx JSX elements that are not Gtk.Widget subclasses either,
// same reason as the pair above — scripts/generate-widget-surface.ts only
// classifies widgets, so these fall into its "notAWidget" bucket (see
// scripts/widget-surface/classification.json) and are otherwise
// unreachable through react-native-gtkx/gtk. Every one of these is a real,
// necessary building block for a real app: actions and menus (Gio), a text
// buffer and an adjustment (the model objects GtkTextView/GtkSpinRow etc.
// bind to), keyboard shortcuts, and the two drag-and-drop controllers.
// Adwaita's own auxiliary elements (AdwBreakpoint, AdwToggle, the
// AdwShortcutsDialog leaves) live in ./adw instead.
export { GMenu, GSimpleAction } from "@gtkx/jsx/gio"
export {
  GtkAdjustment,
  GtkDragSource,
  GtkDropControllerMotion,
  GtkDropTarget,
  GtkShortcut,
  GtkShortcutController,
  GtkTextBuffer,
} from "@gtkx/jsx/gtk"

// The full GTK widget surface — every GTK class gtkx binds that derives
// Gtk.Widget, raw. src/gtk/widgets.generated wraps most of them with
// wrapReactNative; this file is where @gtkx/jsx is still allowed to be
// imported directly (see the eslint carve-out for src/gtkx/bridge/**), so it
// pulls the raw widgets from here rather than from @gtkx/jsx itself.
// Adwaita's raw widgets are the sibling generated file, widgets.generated.adw.ts,
// exported only from ./adw — see that file's header for why the two cannot
// share one module.
export * from "./widgets.generated"

export {
  createPortal,
  createRoot,
  quit,
  rootElement,
  useApplication,
  useBindSetting,
  useParentWindow,
  useProperty,
  useSetting,
  useSignal,
  type Root,
  type RootElement,
} from "@gtkx/react"

// rc.4 moved the settings-schema types off the public entry point into
// /internal, with no replacement on `@gtkx/react` — `useSetting`/
// `useBindSetting` are still public and still typed by them, so a consumer
// that wants to name the type of a setting has no supported import for it.
// We re-export them from here, which is the whole point of the bridge; the
// ask to put them back is filed in docs/upstream-gtkx.md.
export type {
  SettingsSchema,
  SettingsSchemaKeys,
  SettingValue,
} from "@gtkx/react/internal"

export { css, cx, injectGlobal } from "@gtkx/css"

// The imperative counterpart of `css`: a private provider on one widget,
// for values that change per frame and must not enter the shared stylesheet.
export { createWidgetCss, type WidgetCss } from "./widget-css"

export { createTextProbe, measureWidget, toNumber } from "./measure"
export { computePointIn, computePointInWindow, type Point } from "./geometry"
export { beginDragLayer, type DragLayerHandle } from "./drag-layer"
// A portal into a NAMED slot of a remote object (the window's action map,
// its controllers) rather than into its default child slot — see the file
// for why gtkx's own createPortal is not enough on its own.
export { createSlotPortal } from "./slot-portal"
export {
  cacheChildOrder,
  getViewBoxComponent,
  invalidateZOrder,
  setBoxOnly,
  setBoxPassthrough,
  setHitSlop,
  setPaintOnlyLeaf,
  setPointerTarget,
  setZIndex,
  type HitSlop,
} from "./view-box"
export {
  getSvgNodeComponent,
  getSvgNodeDescriptor,
  queueSvgRedraw,
  resolveSvgColor,
  resolveSvgPaint,
  setSvgNodeDescriptor,
  type SvgDefsDescriptor,
  type SvgGradientUnits,
  type SvgGroupDescriptor,
  type SvgLinearGradientDescriptor,
  type SvgNodeDescriptor,
  type SvgPaintSpec,
  type SvgRadialGradientDescriptor,
  type SvgShapeDescriptor,
  type SvgStopDescriptor,
  type SvgSvgDescriptor,
} from "./svg-node"
export {
  allocateChild,
  attachRnLayout,
  detachRnLayout,
  queueAllocate,
  queueResize,
  type RnLayoutHooks,
  type RnLayoutOrientation,
} from "./layout-manager"
