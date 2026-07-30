# rn-app — one React Native app, three platforms

A React Native project bootstrapped with `@react-native-community/cli init`
(the ios/ and android/ folders are the untouched CLI output) with the
**linux** platform added on top via
[react-native-gtkx](../../README.md). One `App.tsx` renders on all three
platforms; on Linux it becomes native GTK4/libadwaita widgets.

## What adding Linux took

1. `react-native-gtkx` in `dependencies` — its own `react-native.config.js`
   declares the out-of-tree platform and the `run-linux` command, nothing
   to declare app-side;
2. two lines in [`metro.config.js`](./metro.config.js) —
   `withLinuxPlatform(getDefaultConfig(__dirname))`;
3. [`gtkx.config.ts`](./gtkx.config.ts) with the GTK application id;
4. a `Platform.OS === "linux"` branch in [`index.js`](./index.js) that
   calls `AppRegistry.runApplication` — on desktop the entry starts the
   app itself (the react-native-web pattern).

Babel stays completely stock — the package ships output the RN preset
transforms as-is.

## Run it

```sh
# Linux (needs GTK4 + libadwaita and Node >= 24)
npm run linux                        # release bundle
npx react-native run-linux --dev     # Metro dev server + Fast Refresh

# iOS / Android — the standard React Native flows
# (not exercised by this repo's CI; the folders are stock CLI output)
npm run ios
npm run android

# Metro dev server for the mobile platforms
npm start
```

`npm run typecheck` checks the shared code (including both platform
variants of `platform-info`).
