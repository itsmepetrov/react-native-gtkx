// The twin to subpath-guards.gtk.test.tsx: react-native-gtkx/common can be
// IMPORTED without "Adw-1" (its barrel mixes Adw-free exports — Widget,
// Icon, SlotContent — with NavigationStack, whose own Adw resolution is
// lazy, inside the component's render — see
// .claude/epics/adw-optional/001.md and
// packages/react-native-gtkx/src/common/navigation-stack.tsx). Rendering it
// is what throws, and it throws react-native-gtkx's own named, actionable
// error (gtkx/bridge/adw.ts's requireAdw) rather than a bundler resolver
// error — this is the one guard in this suite that proves that message's
// actual wording, since this repo's main codegen store has real Adw and can
// only fake the branch decision (vi.mock), never this throw for real.
import { NavigationStack } from "react-native-gtkx/common"
import { render } from "react-native-gtkx/testing"
import { expect, it } from "vitest"

it("rendering NavigationStack without Adw-1 throws the named, actionable error", async () => {
  await expect(render(<NavigationStack stack={[]} />)).rejects.toThrow(
    '[react-native-gtkx] NavigationStack requires "Adw-1" in this app\'s gtkx.config.ts `libraries`',
  )
})
