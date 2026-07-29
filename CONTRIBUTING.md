# Contributing

## Требования

react-native-gtkx работает только на Linux: gtkx требует GTK4 ≥ 4.20, libadwaita ≥ 1.8, Node.js ≥ 24. Чистые JS-части (lint, unit-тесты layout-движка) запускаются на любой ОС; `typecheck` и `test:gtk` требуют Linux — типы `@gtkx/gi`/`@gtkx/jsx` генерируются codegen'ом из системных GIR-файлов (`npm run codegen` → `node_modules/.gtkx`), с macOS запускайте их через `scripts/vm.sh run` (см. ниже).

## Разработка на Linux

```bash
npm install
npm run codegen
npm run typecheck && npm run lint && npm test && npm run test:gtk
```

Системные пакеты (Ubuntu 26.04+): `libgtk-4-dev libadwaita-1-dev xvfb dbus-x11 sway xwayland` (sway — headless Wayland-композитор для `test:gtk`; в rc.1 плагин @gtkx/vitest по умолчанию ждёт weston, поэтому в `vitest.gtk.config.ts` явно указан `compositor: "sway"`).

## Разработка с macOS: UTM-виртуалка (основной путь)

Нативное окно Linux на Mac без Docker: UTM (Virtualization.framework) + Ubuntu Desktop ARM64. Приложения запускаются прямо в GNOME-сессию виртуалки — нативный ввод, настоящая Adwaita. Разовая настройка: установить UTM, создать VM (4 CPU / 8 ГБ / 40 ГБ, Apple backend; в AppleScript-создании включить Display и Keyboard/Pointer в config.plist — GUI-визард делает это сам), в госте: `openssh-server`, `libgtk-4-dev libadwaita-1-dev gobject-introspection libgirepository1.0-dev build-essential pkg-config rsync sway xwayland` + Node 24 (NodeSource), SSH-ключ.

Хелпер `scripts/vm.sh`. Адрес виртуалки — машинно-специфичный: экспортируйте `VM_HOST` (`user@vm-address`) или положите экспорт в `scripts/local/env.sh` (каталог в .gitignore):

| Команда                     | Что делает                                                   |
| --------------------------- | ------------------------------------------------------------ |
| `vm.sh sync`                | rsync репозитория в VM                                       |
| `vm.sh run "<cmd>"`         | команда в VM (нативный GTK — контейнер не нужен)             |
| `vm.sh app examples/<name>` | запуск собранного приложения в GNOME-сессию VM (systemd-run) |
| `vm.sh app-stop`            | остановить приложение                                        |
| `vm.sh shell`               | интерактивный shell                                          |

После `sync` в VM нужен один раз `npm install && npm run codegen` и `npx tsc -p packages/vite-preset/tsconfig.build.json` (dist пресета не синкается). Рендер GL в Apple-бэкенде программный (llvmpipe) — предупреждения EGL/ZINK при старте нормальны.

## Docker-контейнер (альтернатива)

Полный цикл работает в любом Linux-контейнере: образ собирается из `docker/dev.Dockerfile` (GTK 4.22, Node 24, xvfb, sway, x11vnc) и монтирует репозиторий в `/work`:

```bash
docker build -t rn-gtkx-dev -f docker/dev.Dockerfile docker
docker run --rm --init -v "$PWD":/work -w /work rn-gtkx-dev \
  bash -lc 'npm install && npm run codegen && npm test && npm run test:gtk'
```

Живой просмотр окна с хоста — `scripts/live-app.sh <app-dir>` внутри контейнера (VNC на порту 5901).

## Известные особенности инфраструктуры

- вывод GUI-приложений в контейнере пишите в файл, а не в stdout — осиротевший `dbus-daemon` держит пайп и подвешивает `docker run`;
- в headless-тестах ставьте `GTK_A11Y=none`, чтобы убрать предупреждение про accessibility bus;
- 64-битные значения из FFI gtkx приходят как BigInt — приводите через `Number()` на границе;
- тестам `@gtkx/testing` нужен headless Wayland-композитор — в образе есть sway.

## Расхождения с upstream

gtkx приколочен к rc.1, а main уже ушёл вперёд. Все обходы недостающих возможностей помечены в коде тегом `RC1-WORKAROUND(<имя>)` и каталогизированы в [docs/gtkx-rc1-vs-main.md](docs/gtkx-rc1-vs-main.md) вместе с планом миграции на rc.2. Добавляешь обход — добавь тег и строку в таблицу.

## Правила кода

- Весь импорт `@gtkx/*` — только внутри `packages/react-native-gtkx/src/gtkx-bridge/` (проверяется eslint-правилом `no-restricted-imports`): gtkx в статусе RC, изменения его API должны локализоваться в bridge.
- Коммиты — обычные осмысленные сообщения на английском; внутренние номера задач планирования в них не упоминаются.
- Локальное планирование (`.claude/`) и машинно-специфичные скрипты (`scripts/local/`) в репозиторий не коммитятся (.gitignore).
