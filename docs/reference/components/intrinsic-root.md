# IntrinsicRoot

**Profile:** GTK · **Backed by:** an internal layout root

The primitive `react-native-gtkx/common`'s `IntrinsicContent` re-exports
under this name — reach for `IntrinsicContent` in application code; this page
documents the same component under the name the portable `"react-native"`
surface exports it as. See [Layout and styling](../../architecture/layout-and-styling.md#three-flavors-of-layout-root)
for how it fits among the platform's other layout roots.

Differs from react-native:

- Extension: a content-sized Yoga root for chrome slots (a header bar's
  start/end content) — it reports its content size to GTK instead of
  receiving an allocation.
