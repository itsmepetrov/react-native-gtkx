import { reactNativeGtkx } from "react-native-gtkx/vite"
import { defineConfig } from "vite"

// The probe dogfoods the preset exactly as an app would: `react-native`,
// `react-native-reanimated` and `react-native-gesture-handler` are aliased
// onto this platform, and the two libraries under test are the real
// published tarballs, unedited.
export default defineConfig({
  plugins: [reactNativeGtkx()],
  // Unminified with source maps, because the whole value of this app is the
  // stack trace of whatever it hits next. A minified `at d (bundle.js:16:107976)`
  // names nothing; `at NestableScrollContainer.tsx:22` is the finding.
  // Run it with `node --enable-source-maps dist/bundle.js` (run-headless.sh does).
  build: { minify: false, sourcemap: true },
})
