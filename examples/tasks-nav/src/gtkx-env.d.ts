/// <reference types="@gtkx/cli/env" />
/// <reference path="../node_modules/.gtkx/env.d.ts" />

// The linux platform's additions to the STOCK react-native types —
// `Platform.select({ linux })`, and `hovered`/`focused` in Pressable's
// state callback. This app types its `react-native` imports against the
// stock types (no `paths` rewrite in its tsconfig), and
// `components/list.tsx` draws Adwaita's hover tint and focus ring from
// exactly those two fields.
import "react-native-gtkx/types"
