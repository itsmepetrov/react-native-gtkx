# Спайк 001 (эпик layout-manager): вердикт — B0 РАБОТАЕТ

Дата: 2026-07-29. Прогон: VM (Ubuntu 26.04 aarch64, GTK 4.20, headless sway + pixman), `bash run-vm.sh`.

## Вердикт

**B0 подтверждён: GObject-сабкласс GtkLayoutManager регистрируется целиком из JS,
собственный нативный модуль (B1) НЕ НУЖЕН.** gtkx rc.1 даёт всё готовым:

- `@gtkx/native` экспортирует `registerClass(name, parentType, {vfuncs})` с
  нативными трамплинами (NAPI-RS), а `@gtkx/runtime.registerClass(klass, opts)` —
  высокоуровневую обёртку: наследуешь codegen-класс, переопределяешь методы.
- Codegen уже поставляет **полный vfunc-реестр `LayoutManagerClass`**
  (`registerWrapperClass(LayoutManager, ...)` в gi/gtk/gtk.js): byteOffset
  136/144/152 (get_request_mode/measure/allocate), дескрипторы включая
  `t.ref(t.int32)` для out-параметров measure. Оффсеты никто руками не считает.
- Out-параметры vfunc'а возвращаются из JS-метода **кортежем**:
  `measure() → [minimum, natural, minBaseline, natBaseline]`
  (runtime `splitTupleResult`/`writeOutParams`).
- `receiver: "this"` — в vfunc `this` === JS-инстанс менеджера (созданный
  конструктором wrapper'а через setWrapper), поэтому состояние (rect'ы) живёт
  прямо в полях инстанса, WeakMap не нужен.

## Результаты прогона (все фазы зелёные)

```
SUBCLASS OK type=RnGtkxLayout isA(LayoutManager)=true
MEASURE  OK h=[300,300] v=[200,200] labelMin=507 calls=2
ALLOCATE OK a=10,10,120,30 b=150,10,120,30 o=280,60,60,30
OVERFLOW OK measureAfter=[300,300] childRight=340
SHRINK   OK window=200x150 (минимум каждой метки 507px)
PERF     207.8ms / 1000 allocations x 50 children (~0.21ms на полный проход)
PAINT-PIXELS OK block=86 control=250 — overflow-ребёнок нарисован за границей
```

Скриншот: shots/paint.ppm (блок ██ прорисован правее границы контейнера поверх
фона соседнего бокса — paint-overflow как в RN).

## Факты, влияющие на 002/003/006

1. **`typeName` обязателен**: `registerClass` по умолчанию берёт `klass.name`,
   а бандлер минифицирует классы → `GLib-GObject-CRITICAL: type name 'X9' is
too short` и G_TYPE_INVALID. Всегда передавать
   `registerClass(K, { typeName: "..." })`.
2. **GtkFixed несовместим с чужим менеджером**: `gtk_fixed_put` требует
   `GtkFixedLayoutChild` от ТЕКУЩЕГО менеджера контейнера. `GtkBox.append`
   layout-children не трогает — подмена менеджера после append безопасна.
   → В 003 контейнеры переводим с GtkFixed на GtkBox (реконсилер gtkx
   аппендит детей Box штатно), либо parent'им вручную.
3. **GTK4 молчит про аллокацию ниже минимума** — 0 предупреждений за прогон
   (единственный warning — locale, не про раскладку). Подавление не нужно.
4. **Недо-аллоцированный GtkLabel рисует ПОЛНЫЙ текст за пределами аллокации**
   (в спайке две метки перекрылись). RN-семантика текста требует клипа своим
   боксом → в 006 текстовым листьям ставить `gtk_widget_set_overflow(HIDDEN)`
   (paint-клип), контейнерам оставить VISIBLE (paint-overflow).
5. **SHRINK без обёртки**: floating-окно приняло setDefaultSize(200,150) точно,
   минимумы детей (507px) не мешают — «трещотка» устранена самим менеджером.
   sway-IPC-ресайз не понадобился (floating + setDefaultSize эквивалентен для
   проверки ратчета).
6. **Никаких RC1-WORKAROUND**: `getHandle`/`getInstanceType`/`typeIsA`/
   `resolveType`/`registerClass` — публичные экспорты `@gtkx/runtime`.
   В 002 добавить `@gtkx/runtime` прямой зависимостью пакета (сейчас она
   транзитивная через @gtkx/react).
7. **Перф**: 0.21ms на синхронный vfunc-проход (measure+allocate 50 детей,
   FFI-путь native→JS→50×sizeAllocate). Бюджет для сравнения в 003.
8. Регистрация класса на module load (до activate/Gtk.init) работает — GObject
   готов сразу после импорта @gtkx/native (init() в main.js пакета).

## B1/B2

- B1 (мини-аддон C) — не нужен, ветка закрыта без реализации.
- B2 (upstream) — остаётся желательным треком (нативные трамплины без
  FFI-маршалинга на каждый кадр), оформляется в 008; не блокер.
