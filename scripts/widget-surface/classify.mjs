// Pure classification logic, no filesystem writes, no gtkx runtime import at
// module scope — the caller injects the real Gtk/Adw namespaces (only
// resolvable on Linux, inside the VM) and the parsed component name lists.
//
// Rules (see docs/platform-layer.md and .claude/epics/widget-surface for the
// reasoning):
//   1. include only if X.prototype instanceof Gtk.Widget (drops event
//      controllers, adjustments, models, animations, cell renderers, ...);
//   2. exclude toplevels: X is/derives Gtk.Window;
//   3. exclude child-only-by-inheritance: X is/derives Gtk.ListBoxRow or
//      Gtk.FlowBoxChild (catches every Adwaita preferences row too, since
//      Adw.PreferencesRow itself derives Gtk.ListBoxRow);
//   4. DENYLIST — widgets the mechanical rules cannot decide, verified
//      against the real GIR documentation bundled in the .d.ts (see
//      scripts/widget-surface/README or the epic task file for the
//      research trail). Each entry names the exact reason.
export const DENYLIST = {
  AdwNavigationPage: {
    reason:
      'GIR doc: "A page within NavigationView or NavigationSplitView." ' +
      "Derives Gtk.Widget directly (no shared marker base with ListBoxRow/" +
      "FlowBoxChild), yet is valid only as a direct child of those two " +
      "widgets — pushed/popped by tag, not laid out by Yoga. Matches the " +
      "pre-existing decision: it was already a raw export before this epic.",
  },
  AdwPreferencesPage: {
    reason:
      'GIR doc: "A page from PreferencesDialog... gathers preferences ' +
      'groups into a single page of a preferences window." Same family as ' +
      "NavigationPage — derives Gtk.Widget directly, valid only as a " +
      "direct child of AdwPreferencesDialog/AdwPreferencesWindow.",
  },
}

const isSelfOrInstance = (cls, base) =>
  cls === base || cls.prototype instanceof base

/**
 * @param {object} args
 * @param {Record<string, unknown>} args.Gtk - the real @gtkx/gi/gtk namespace
 * @param {Record<string, unknown>} args.Adw - the real @gtkx/gi/adw namespace
 * @param {string[]} args.gtkComponentNames - "GtkFoo" names parsed from gtk.d.ts
 * @param {string[]} args.adwComponentNames - "AdwFoo" names parsed from adw.d.ts
 */
export const classify = ({
  Gtk,
  Adw,
  gtkComponentNames,
  adwComponentNames,
}) => {
  const resolve = (name, prefix, ns) => ns[name.slice(prefix.length)]

  const classifyOne = (name, cls) => {
    const isWidget = isSelfOrInstance(cls, Gtk.Widget)
    if (!isWidget) {
      return { name, bucket: "not-a-widget" }
    }
    if (isSelfOrInstance(cls, Gtk.Window)) {
      return { name, bucket: "raw", reason: "toplevel (derives Gtk.Window)" }
    }
    if (isSelfOrInstance(cls, Gtk.ListBoxRow)) {
      return {
        name,
        bucket: "raw",
        reason: "child-only (derives Gtk.ListBoxRow)",
      }
    }
    if (isSelfOrInstance(cls, Gtk.FlowBoxChild)) {
      return {
        name,
        bucket: "raw",
        reason: "child-only (derives Gtk.FlowBoxChild)",
      }
    }
    if (DENYLIST[name]) {
      return {
        name,
        bucket: "raw",
        reason:
          "child-only (denylist — see scripts/widget-surface/classify.mjs)",
      }
    }
    return { name, bucket: "wrapped" }
  }

  const gtkResults = gtkComponentNames.map((name) => {
    const cls = resolve(name, "Gtk", Gtk)
    if (!cls) {
      return { name, bucket: "unresolved" }
    }
    return classifyOne(name, cls)
  })
  const adwResults = adwComponentNames.map((name) => {
    const cls = resolve(name, "Adw", Adw)
    if (!cls) {
      return { name, bucket: "unresolved" }
    }
    return classifyOne(name, cls)
  })

  return { gtk: gtkResults, adw: adwResults }
}
