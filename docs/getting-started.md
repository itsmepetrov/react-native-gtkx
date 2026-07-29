# Getting Started

react-native-gtkx позволяет писать нативные Linux (GTK4/Adwaita) приложения в API React Native. Никаких `@gtkx/*`-импортов в вашем коде — только `react-native`.

## Требования

- Linux (x64/arm64, glibc), GTK4 ≥ 4.20, libadwaita ≥ 1.8 (Ubuntu 26.04+, Fedora 43+);
- Node.js ≥ 24;
- dev-пакеты: `sudo apt install libgtk-4-dev libadwaita-1-dev` (Ubuntu).

## Новый проект из шаблона

```bash
cp -r <репозиторий>/template my-app && cd my-app
npm install        # до публикации пакета: замените зависимость на file:-путь, см. README шаблона
npm run dev        # окно с Fast Refresh (правки применяются без перезапуска)
npm run build && npm start   # прод-бандл, запускается обычным node
```

Замер на чистом контейнере Ubuntu 26.04: от установки до окна — 63 секунды.

## Как это устроено

```
ваш код (react-native API)
  └─ vite-пресет: alias react-native → react-native-gtkx, платформенные
     расширения .linux.tsx → .native.tsx → базовый
      └─ react-native-gtkx: Yoga (WASM) считает flexbox; стили делятся на
         layout (Yoga) и визуальные (GTK CSS); координаты применяются к
         настоящим GTK-виджетам
          └─ gtkx: React-реконсилер → GTK4 через FFI
```

Точка входа — как в RN:

```tsx
import { AppRegistry, StyleSheet, Text, View } from "react-native"

const App = () => (
  <View style={styles.screen}>
    <Text style={styles.title}>Привет, GNOME!</Text>
  </View>
)

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700" },
})

AppRegistry.registerComponent("app", () => App)
AppRegistry.runApplication("app", { title: "My App", width: 800, height: 600 })
```

`runApplication` принимает десктопные параметры (`title`, `width`, `height`) — это единственное расширение относительно RN-сигнатуры.

## Примеры в репозитории

- `examples/profile` — статическая раскладка + тот же исходник собирается react-native-web (`examples/profile-web`);
- `examples/playground` — интерактив: Pressable, TextInput, Switch, FlatList, Modal, Animated, responsive через flexWrap;
- `examples/gallery` — галерея всей поверхности v1.

## Тесты

Unit-логика — обычный vitest. Компонентные тесты — `@gtkx/testing` (render/screen/fireEvent) под headless Wayland: см. `packages/react-native-gtkx/tests-gtk/` и `npm run test:gtk`. В тестах кликайте через `fireEvent`, роли запрашивайте enum'ами `Gtk.AccessibleRole` (см. docs/gtkx-rc1-vs-main.md).

## Дальше

- [docs/api.md](api.md) — вся поверхность v1 и отличия от RN;
- [CONTRIBUTING.md](../CONTRIBUTING.md) — разработка самой библиотеки (в т.ч. с macOS через удалённый контейнер);
- [docs/gtkx-rc1-vs-main.md](gtkx-rc1-vs-main.md) — обходы rc.1 и план миграции.
