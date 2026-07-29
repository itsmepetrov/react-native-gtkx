# react-native-gtkx

**React Native для Linux-десктопа.** Пишите приложения в знакомом API React Native (`View`, `Text`, `StyleSheet`, flexbox) — они работают как нативные GNOME-приложения на настоящих GTK4/Adwaita-виджетах, без WebView и canvas-рендера.

Под капотом: [gtkx](https://github.com/gtkx-org/gtkx) (React-реконсилер для GTK4 на Node.js) + [Yoga](https://yogalayout.dev) (движок RN-флексбокса). Модель — как у react-native-web: слой совместимости поверх другого рендерера, alias `react-native` → `react-native-gtkx` через vite-пресет.

![profile — GTK](docs/shots/profile.png)

_Демо `examples/profile`: ни одного импорта `@gtkx/*` — только `react-native`. Каждый прямоугольник — настоящий GTK-виджет; flexbox считает Yoga, текст меряет Pango._

Тот же исходник, собранный через react-native-web ([доказательство переносимости](docs/shots/profile-web.png)) — структурно идентичен.

## Статус

- [x] Спайк Yoga + GtkFixed — **GO** (точность 0 px, reflow 500 узлов 0.17 мс, 60 fps — `spike/RESULTS.md`)
- [x] Дев-окружение (Docker/VM, GTK 4.22, live-VNC) и CI-workflow
- [x] gtkx-bridge (изоляция от RC API; [каталог обходов rc.1](docs/gtkx-rc1-vs-main.md))
- [x] Layout-движок (Yoga shadow-дерево, measure через Pango, батчинг, дифф, onLayout)
- [x] StyleSheet: сплит layout/визуальных, цвета CSS Color 4, PlatformColor → Adwaita
- [x] View / Text / Image / AppRegistry — первый RN-рендер в GTK
- [x] Platform / Dimensions / Appearance / AppState / Alert / Linking (+ хуки)
- [x] Pressable / TouchableOpacity / TextInput / ScrollView / FlatList / Switch / Modal / Animated
- [x] Vite-пресет (alias, платформенные расширения) + шаблон проекта (установка → окно за 63 с)
- [ ] Галерея компонентов, финальная документация — в работе

Проверено вживую: интерактивный `examples/playground` (кнопки, ввод, скролл, модалки, анимация, responsive на flexWrap) — 325 тестов (unit + компонентные под headless Wayland).

## Документация

- [Getting Started](docs/getting-started.md) — новый проект за минуту;
- [API v1](docs/api.md) — вся поверхность и отличия от RN;
- [CONTRIBUTING](CONTRIBUTING.md) — разработка библиотеки (в т.ч. с macOS через удалённый контейнер);
- дорожная карта и решения: `.claude/prds/`, `.claude/epics/` (ccpm).

## Требования

Linux, GTK4 ≥ 4.20, libadwaita ≥ 1.8, Node.js ≥ 24.

## Лицензия

MIT
