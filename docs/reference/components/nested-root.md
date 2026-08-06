# NestedRoot

**Profile:** GTK · **Backed by:** an internal layout root

The primitive `react-native-gtkx/common`'s `SlotContent` re-exports under
this name — reach for `SlotContent` in application code; this page documents
the same component under the name the portable `"react-native"` surface
exports it as. See [Layout and styling](../../architecture/layout-and-styling.md#three-flavors-of-layout-root)
for how it fits among the platform's other layout roots.

Differs from react-native:

- Extension: a Yoga layout root inside any GTK container slot (a navigation
  page, a custom container) — the slot's own allocation is the viewport.
