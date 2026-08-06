# TouchableHighlight

**Profile:** GTK · **Backed by:** built on `Pressable`

Supported props: `underlayColor` (default `black`, as in RN),
`activeOpacity`, `onShowUnderlay` / `onHideUnderlay`.

Differs from react-native:

- RN renders a separate underlay view behind the child and dims the child
  onto it. Here the highlight is the view's own `backgroundColor` while
  pressed — an extra box would change flex layout and what `measureLayout`
  measures relative to, the same reason `GestureDetector` and
  `createAnimatedComponent` add none either. Give the child a translucent
  background for RN's exact blend.
