# TouchableWithoutFeedback

**Profile:** GTK · **Backed by:** built on `Pressable`

Supported props: the same press/hover/focus props as `Pressable`, with no
visual reaction.

Differs from react-native:

- RN clones its single child rather than rendering a box of its own — its
  own documentation calls that a compatibility artifact. This renders the
  `Pressable` box instead. Prefer `Pressable` directly, as RN's own docs
  recommend.
