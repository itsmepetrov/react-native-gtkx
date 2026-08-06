# Root

**Profile:** GTK · **Backed by:** an internal layout root

The layout root a real app never mounts directly —
`AppRegistry.runApplication` creates the window's own root — but a test does,
rendering a tree under `<Root width height>` in place of a window. See
[Testing](../../guide/toolchains.md#testing).

Supported props: `width`, `height`.

Differs from react-native:

- Extension: the root the test harness renders a tree into.
