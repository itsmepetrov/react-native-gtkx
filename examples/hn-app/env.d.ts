// Teaches the stock react-native types about the linux platform
// (Platform.select({ linux: ... }) and future platform props).
import "react-native-gtkx/types"

// The bundle runs in the Node host, but tsconfig sets `types: []` (no
// @types/node) — declare the one Node global slice the app touches
// (the HN_APP_PROOF headless hook reads it).
declare global {
  const process: {
    env: Record<string, string | undefined>
  }
}
