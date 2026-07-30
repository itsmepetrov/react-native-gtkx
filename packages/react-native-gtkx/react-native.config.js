// Out-of-tree platform declaration (the react-native-windows model): apps
// depending on this package get the "linux" platform and the run-linux
// command registered with the RN CLI. The package is type:module, so this
// config is an ES module — the CLI loads dependency configs through a
// loader that accepts both. The self-reference resolves through the
// exports map into the built dist.
import { commands } from "react-native-gtkx/runner"

export default {
  commands,
  platforms: {
    linux: {
      npmPackageName: "react-native-gtkx",
      // The out-of-tree contract requires both hooks. They feed autolinking
      // of platform-native project files — our "native" is plain Node
      // modules resolved at runtime, so there is nothing to link.
      projectConfig: () => null,
      dependencyConfig: () => null,
    },
  },
}
