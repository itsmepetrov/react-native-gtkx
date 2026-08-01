// One GtkCssProvider per animated widget: the imperative escape hatch that
// lets a colour reach a MOUNTED widget without a React render.
//
// The ordinary path is a memoised class in one global stylesheet
// (../../style/registry.ts + @gtkx/css), and it is the wrong shape for an
// animation by construction — its cache key IS the CSS text, so a value that
// changes every frame mints a class per frame, appends a rule to a document
// that is never pruned, and makes GTK re-parse the whole thing. Measured on
// the VM: 0.8 ms for the first frame, 6.8 ms by frame 600, still climbing,
// plus 600 permanently-live classes for one second of animation.
//
// WHY THE WIDGET'S OWN STYLE CONTEXT AND NOT THE DISPLAY. Both were measured
// (docs/research/animated-colors.md). `Gtk.StyleContext.addProviderForDisplay`
// is the non-deprecated API, but a display-level provider invalidates every
// CSS node on the display each time it is reloaded, so the cost of one
// animated colour is proportional to how many widgets are on screen: +527 µs
// per frame in a 60-widget tree, +1634 µs at 300. A provider on the widget's
// own style context invalidates that widget alone — +79 µs at 60 widgets,
// +24 µs at 300, i.e. flat, and inside the noise of the paint it triggers
// anyway.
//
// `gtk_widget_get_style_context()` and `gtk_style_context_add_provider()` are
// deprecated (GTK 4.10), and GTK's own migration note points at exactly the
// display-wide replacement measured above. This file is where that trade is
// made and where it will be re-made: if GTK5 removes the per-widget cascade,
// the fallback is a display-wide provider plus a unique class per widget, at
// the measured cost — the surface here does not change.
//
// The selector is `*`, not a class. Verified against GTK 4.22: a provider on
// a widget's style context matches THAT widget's CSS node and not its
// children (a `min-width` written through it moved the widget and left its
// child alone), and unlike a class it cannot be destroyed by React writing
// the `cssClasses` prop — which it would be, since gtkx sets the whole list.
import {
  CssProvider,
  STYLE_PROVIDER_PRIORITY_APPLICATION,
  StyleContext,
  type Widget,
} from "@gtkx/gi/gtk"

export type WidgetCss = {
  /**
   * Replaces the widget's imperative declarations. `body` is a GTK CSS
   * declaration list without a selector or braces (`background-color: rgb(1,
   * 2, 3);`); an empty string removes everything this provider contributes.
   */
  set(body: string): void
  /** Detaches the provider. Safe to call more than once. */
  dispose(): void
}

// One above APPLICATION, which is where both @gtkx/css's stylesheet and any
// app-level CSS land. A driven value has to win over the static class it is
// replacing for the duration of the animation; it stays below USER (800) so
// a user stylesheet still overrides everything, as GTK intends.
const PRIORITY = STYLE_PROVIDER_PRIORITY_APPLICATION + 1

/**
 * Attaches a private CSS provider to `widget`. Writes are O(1) in the size of
 * the widget tree and do not touch the shared stylesheet, so nothing about
 * the static style path — including its memoisation — changes.
 */
export const createWidgetCss = (widget: Widget): WidgetCss => {
  const provider = new CssProvider()
  // Held rather than re-fetched: getStyleContext() is a call into GTK, and
  // removeProvider must be given the same context addProvider was.
  const context: StyleContext = widget.getStyleContext()
  context.addProvider(provider, PRIORITY)

  let current: string | null = null
  let disposed = false

  return {
    set(body) {
      if (disposed || body === current) {
        return
      }
      current = body
      // An empty rule is still a rule GTK has to parse and match, so an
      // empty body loads an empty document instead.
      provider.loadFromString(body === "" ? "" : `* { ${body} }`)
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      context.removeProvider(provider)
    },
  }
}
