// Runs patch-package on Linux only: the patched @gtkx/react .d.ts shape
// exists only in Linux installs (see patches/@gtkx+react+1.0.0.patch's
// platform note), and the defect it fixes cannot manifest elsewhere.
import { spawnSync } from "node:child_process"

if (process.platform === "linux") {
  const result = spawnSync("npx", ["patch-package"], { stdio: "inherit" })
  process.exit(result.status ?? 1)
} else {
  console.log("apply-patches: non-Linux platform, patches skipped")
}
