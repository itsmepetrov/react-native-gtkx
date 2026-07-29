# hello-react-native-gtkx

Минимальное приложение на чистом React Native API (`View`, `Text`, `StyleSheet`), работающее как нативное GNOME-приложение: рендер — настоящие GTK4/Adwaita-виджеты через [react-native-gtkx](https://github.com/…/react-native-gtkx).

## Требования

- Linux, GTK4 ≥ 4.20, libadwaita ≥ 1.8, Node.js ≥ 24;
- dev-заголовки для codegen: `libgtk-4-dev libadwaita-1-dev` (Ubuntu).

## Быстрый старт

```bash
npx degit <owner>/react-native-gtkx/template my-app
cd my-app
npm install
npm run dev     # окно приложения + Fast Refresh: правка src/App.tsx видна без перезапуска
```

Прод-сборка:

```bash
npm run build   # единый bundle: dist/bundle.js
npm start       # node dist/bundle.js
```

> ⏱ Замер «от установки до окна» в чистом контейнере Ubuntu 26.04 (системные зависимости предустановлены): **63 секунды** (npm install + gtkx build + запуск; 2026-07-29, scripts/verify-template.sh).

## ⚠️ Пока пакеты не опубликованы

`react-native-gtkx@0.1.0` и `@react-native-gtkx/vite-preset@0.1.0` ещё не выложены в npm. До публикации подключите их из клона монорепо, заменив версии на `file:`-ссылки в `package.json`:

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

(пути — относительно вашего проекта; после правки — `npm install`).

## Как это устроено

- `gtkx dev` / `gtkx build` сами запускают vite и автоматически подхватывают `vite.config.ts` из корня проекта;
- пресет `@react-native-gtkx/vite-preset` добавляет alias `react-native` → `react-native-gtkx` и платформенные расширения Metro;
- типы для `import … from "react-native"` даёт маппинг `paths` в `tsconfig.json`;
- entry по умолчанию — `src/index.tsx` (регистрация приложения через `AppRegistry`).

### Платформенные расширения

Для import'ов без расширения работает приоритет `.linux.tsx` → `.linux.ts` → `.native.tsx` → `.native.ts` → базовый файл (а также `.jsx`/`.js`). Например, положите рядом `Comp.tsx` и `Comp.linux.tsx` — при `import { Comp } from "./Comp"` соберётся linux-вариант. `Platform.select({ linux: …, native: …, default: … })` работает как в RN и тришейкается в прод-сборке.

## Упаковка

`npm run build` даёт единственный файл `dist/bundle.js` — приложение запускается любым Node ≥ 24. Простейший `.desktop`-файл:

```ini
[Desktop Entry]
Type=Application
Name=Hello react-native-gtkx
Exec=node /opt/hello-gtkx/bundle.js
Categories=Utility;
```

Для фонового/сервисного запуска подойдёт обычный systemd user unit (`ExecStart=node /opt/hello-gtkx/bundle.js`). Упаковка во Flatpak возможна, но вне рамок этого шаблона.
