# @react-native-gtkx/vite-preset

Vite-пресет, делающий gtkx-проект «RN-совместимым»:

- **alias** `react-native` → `react-native-gtkx` (включая субпути: `react-native/foo` → `react-native-gtkx/foo`);
- **платформенные расширения** в семантике Metro для import'ов без расширения: `.linux.tsx` → `.linux.ts` → `.linux.jsx` → `.linux.js` → `.native.tsx` → … → базовый файл (его находит стандартный резолвер vite); поддерживаются и платформенные index-файлы каталогов (`./menu` → `menu/index.linux.tsx`);
- **dev-режим gtkx**: `react-native-gtkx` добавляется в `ssr.noExternal`, чтобы его TypeScript-исходники шли через пайплайн vite, а не в чистый node-импорт (в `gtkx dev` стоит `ssr.external: true`).

## Подключение

gtkx CLI rc.1 (`gtkx dev` и `gtkx build`) запускает vite сам, но не отключает поиск конфига (`configFile: false` не передаётся) — поэтому обычный `vite.config.ts` в корне проекта подхватывается автоматически и мержится с конфигом CLI (при конфликте выигрывает CLI, массивы плагинов складываются).

```ts
// vite.config.ts
import { reactNativeGtkx } from "@react-native-gtkx/vite-preset"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [reactNativeGtkx()],
})
```

Больше ничего не нужно: `gtkx dev` / `gtkx build` работают как обычно.

## Опции

```ts
reactNativeGtkx({
  // приоритет платформ, от специфичной к общей
  platforms: ["linux", "native"],
  // расширения, пробуемые для каждой платформы
  extensions: ["tsx", "ts", "jsx", "js"],
})
```

## Семантика резолва

- участвуют только import'ы **без расширения** — относительные (`./Comp`, `../shared/Comp`) и абсолютные пути; `./Comp.tsx` берётся буквально;
- bare-import'ы пакетов (`lodash`, `@scope/pkg`) через платформенный резолв не проходят;
- если платформенного файла нет — плагин отдаёт import стандартному резолверу vite (базовый `Comp.tsx`);
- `?query`-суффиксы vite сохраняются.

Чистые функции резолва (`rewriteReactNativeImport`, `platformCandidates`, `resolvePlatformSpecifier` и др.) экспортируются из пакета и покрыты unit-тестами без запуска vite-сервера.

## TypeScript

Alias работает на уровне бандлера; чтобы типы `import { View } from "react-native"` видел и tsc, добавьте в `tsconfig.json` проекта:

```json
{
  "compilerOptions": {
    "paths": {
      "react-native": ["./node_modules/react-native-gtkx/src/index.ts"]
    }
  }
}
```

## Известное ограничение: тришейкинг `Platform.select`

Ветки `Platform.select({ ios, android, ... })` — аргумент рантайм-вызова, и
бандлер (rolldown) их **не устраняет** (проверено маркером мёртвой ветки в
прод-bundle). Для десктопного Node-бандла размер некритичен; если понадобится
DCE — ответвление: замена `Platform.OS` на литерал "linux" transform-плагином
(define-инлайнинг) до минификации.
