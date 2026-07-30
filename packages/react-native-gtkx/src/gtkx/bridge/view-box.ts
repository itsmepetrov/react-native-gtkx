// RnGtkxViewBox — the GtkBox subclass every View renders. Its contains()
// consults a per-widget flag: a "pass-through" box is never returned by
// GTK's pick (RN pointerEvents="box-none" — the box is transparent while
// children stay pickable, and toggling the mode never remounts the
// subtree); otherwise it reproduces the default bounds check. Registered
// lazily like RnGtkxLayout (registration needs GObject, class identity
// must exist before the first instance).
import * as Gtk from "@gtkx/gi/gtk"
import { createElementComponent } from "@gtkx/react/internal"
import { registerClass } from "@gtkx/runtime"

const passthrough = new WeakSet<object>()

/** box-none toggle: picking consults this live, no invalidation needed. */
export const setBoxPassthrough = (
  widget: Gtk.Widget,
  enabled: boolean,
): void => {
  if (enabled) {
    passthrough.add(widget)
  } else {
    passthrough.delete(widget)
  }
}

type ViewBoxComponent = ReturnType<typeof createElementComponent>

let component: ViewBoxComponent | null = null

export const getViewBoxComponent = (): ViewBoxComponent => {
  if (component) {
    return component
  }

  class RnGtkxViewBox extends Gtk.Box {
    override contains(x: number, y: number): boolean {
      if (passthrough.has(this)) {
        return false
      }
      // The default widget behavior: inside the widget's own bounds.
      return x >= 0 && y >= 0 && x < this.getWidth() && y < this.getHeight()
    }
  }
  // Explicit typeName: bundlers minify class names.
  registerClass(RnGtkxViewBox, { typeName: "RnGtkxViewBox" })
  component = createElementComponent("RnGtkxViewBox")
  return component
}
