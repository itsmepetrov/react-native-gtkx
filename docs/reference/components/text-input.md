# TextInput

**Backed by:** `GtkEntry` (single line) / `GtkTextView` (multiline)

Supported props:

- Controlled and uncontrolled use (`value` / `defaultValue`), `onChangeText`,
  `onSubmitEditing`, `onFocus` / `onBlur`.
- `placeholder` — its own dim overlay in multiline mode, since `GtkTextView`
  has none built in.
- `secureTextEntry`, `editable`, `keyboardType`, `multiline`.
- `clearButtonMode` — `GtkEntry`'s built-in clear icon (RN only ships this on
  iOS).
- The visual half of `style` — background, border and radius all reach the
  widget, rather than being computed and dropped.

Differs from react-native:

- Multiline needs an explicit `height` in its style, exactly as RN
  recommends.
- A real `GtkTextView` wraps words, scrolls internally, and inserts a newline
  on Enter rather than firing `onSubmitEditing` — RN's own multiline
  semantics.
