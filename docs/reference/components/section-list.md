# SectionList

**Profile:** GTK · **Backed by:** built on `FlatList`

![The gallery's Lists section: a FlatList with a ListHeaderComponent, item separators and a SectionList with sticky section headers.](../../shots/gallery/lists.png)

Supported props: `sections`, `renderSectionHeader`, sticky section headers
by default (`stickySectionHeadersEnabled`).

Differs from react-native:

- Viewability props are not exposed yet (section-aware `ViewToken`s are not
  implemented).
