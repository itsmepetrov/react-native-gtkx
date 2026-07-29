# hello-react-native-gtkx

A minimal application built on the pure React Native API (`View`, `Text`, `StyleSheet`) that runs as a native GNOME application: rendering is done with real GTK4/Adwaita widgets via [react-native-gtkx](https://github.com/…/react-native-gtkx).

## Requirements

- Linux, GTK4 ≥ 4.20, libadwaita ≥ 1.8, Node.js ≥ 24;
- dev headers for codegen: `libgtk-4-dev libadwaita-1-dev` (Ubuntu).

## Quick start

```bash
npx degit <owner>/react-native-gtkx/template my-app
cd my-app
npm install
npm run dev     # application window + Fast Refresh: edits to src/App.tsx show up without a restart
```

Production build:

```bash
npm run build   # single bundle: dist/bundle.js
npm start       # node dist/bundle.js
```

> ⏱ "Install to window" measurement in a clean Ubuntu 26.04 container (system dependencies preinstalled): **63 seconds** (npm install + gtkx build + launch; 2026-07-29, scripts/verify-template.sh).

## ⚠️ Until the packages are published

`react-native-gtkx@0.1.0` and `@react-native-gtkx/vite-preset@0.1.0` are not on npm yet. Until they are published, wire them up from a monorepo clone by replacing the versions with `file:` references in `package.json`:

```json
{
  "dependencies": {
    "react-native-gtkx": "file:../react-native-gtkx/packages/react-native-gtkx"
  },
  "devDependencies": {
    "@react-native-gtkx/vite-preset": "file:../react-native-gtkx/packages/vite-preset"
  }
}
```

(paths are relative to your project; run `npm install` after editing).

## How it works

- `gtkx dev` / `gtkx build` launch vite themselves and automatically pick up `vite.config.ts` from the project root;
- the `@react-native-gtkx/vite-preset` preset adds the `react-native` → `react-native-gtkx` alias and Metro platform extensions;
- types for `import … from "react-native"` come from the `paths` mapping in `tsconfig.json`;
- the default entry is `src/index.tsx` (application registration via `AppRegistry`).

### Platform extensions

For extensionless imports the priority is `.linux.tsx` → `.linux.ts` → `.native.tsx` → `.native.ts` → the base file (plus `.jsx`/`.js`). For example, put `Comp.tsx` and `Comp.linux.tsx` side by side — `import { Comp } from "./Comp"` will build the linux variant. `Platform.select({ linux: …, native: …, default: … })` works as in RN and is tree-shaken in the production build.

## Packaging

`npm run build` produces a single file, `dist/bundle.js` — the application runs on any Node ≥ 24. The simplest `.desktop` file:

```ini
[Desktop Entry]
Type=Application
Name=Hello react-native-gtkx
Exec=node /opt/hello-gtkx/bundle.js
Categories=Utility;
```

For background/service launch, a regular systemd user unit works (`ExecStart=node /opt/hello-gtkx/bundle.js`). Flatpak packaging is possible but out of scope for this template.
