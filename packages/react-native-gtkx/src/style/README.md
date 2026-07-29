# Стили: поддержанные свойства

Конвейер: `StyleSheet.flatten` → `splitStyle` (layout / visual) → `visualStyleToCss` → мемоизированный
`CssRegistry` (`css` из bridge) → класс в `cssClasses` виджета. Layout-часть уходит в Yoga через
`LayoutNodeApi.setStyle` (задача 004) и в CSS не попадает.

Статусы: **поддержано** — работает целиком; **частично** — работает с оговоркой из примечания;
**игнорируется** — свойство вне замороженного контракта, `console.warn` один раз на ключ.

## Layout (→ Yoga, задача 004)

Все ключи `LayoutStyle` из `contracts.ts` классифицируются в `layout` без изменений:
`alignContent`, `alignItems`, `alignSelf`, `aspectRatio`, `bottom`, `columnGap`, `direction`,
`display`, `flex`, `flexBasis`, `flexDirection`, `flexGrow`, `flexShrink`, `flexWrap`, `gap`,
`height`, `justifyContent`, `left`, `margin`, `marginBottom`, `marginHorizontal`, `marginLeft`,
`marginRight`, `marginTop`, `marginVertical`, `maxHeight`, `maxWidth`, `minHeight`, `minWidth`,
`overflow`, `padding`, `paddingBottom`, `paddingHorizontal`, `paddingLeft`, `paddingRight`,
`paddingTop`, `paddingVertical`, `position`, `right`, `rowGap`, `top`, `width` — **поддержано**
(фактическое поведение определяет layout-движок).

## Visual (→ GTK CSS)

| Свойство                                                                                              | Статус     | GTK CSS / примечание                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backgroundColor`                                                                                     | поддержано | `background-color`                                                                                                                                                                 |
| `opacity`                                                                                             | поддержано | `opacity` (клампится в [0, 1])                                                                                                                                                     |
| `borderWidth`                                                                                         | поддержано | `border-width`; авто-`border-style: solid`, если ЛЮБАЯ ширина рамки > 0 и `borderStyle` не задан (у GTK по умолчанию `border-style: none`)                                         |
| `borderTopWidth` / `borderRightWidth` / `borderBottomWidth` / `borderLeftWidth`                       | поддержано | по-сторонние `border-*-width`, эмитятся после шортхенда и перекрывают его; тоже включают авто-solid при ширине > 0                                                                 |
| `borderColor`                                                                                         | поддержано | `border-color`; без ширины рамка не видна (как в RN: ширина по умолчанию 0)                                                                                                        |
| `borderTopColor` / `borderRightColor` / `borderBottomColor` / `borderLeftColor`                       | поддержано | по-сторонние `border-*-color`, эмитятся после шортхенда и перекрывают его                                                                                                          |
| `borderStyle`                                                                                         | поддержано | `border-style` (`solid` / `dotted` / `dashed` — есть в GTK4 CSS); явное значение побеждает авто-solid                                                                              |
| `borderRadius`                                                                                        | поддержано | `border-radius`                                                                                                                                                                    |
| `borderTopLeftRadius` / `borderTopRightRadius` / `borderBottomRightRadius` / `borderBottomLeftRadius` | поддержано | по-угловые `border-*-radius`, эмитятся после шортхенда и перекрывают его                                                                                                           |
| `color`                                                                                               | поддержано | `color`                                                                                                                                                                            |
| `fontFamily`                                                                                          | поддержано | `font-family` (имена с пробелами берутся в кавычки)                                                                                                                                |
| `fontSize`                                                                                            | поддержано | `font-size` в px                                                                                                                                                                   |
| `fontStyle`                                                                                           | поддержано | `font-style`                                                                                                                                                                       |
| `fontWeight`                                                                                          | поддержано | `font-weight` (ключевые слова и числовые строки "100"–"900")                                                                                                                       |
| `letterSpacing`                                                                                       | поддержано | `letter-spacing` в px                                                                                                                                                              |
| `lineHeight`                                                                                          | частично   | `line-height` в px (GTK ≥ 4.6); RN-семантика «высота строки в pt» совпадает, множителей RN не имеет                                                                                |
| `textAlign`                                                                                           | частично   | применяется компонентом `Text`, не CSS (в GTK4 CSS нет `text-align`): чистый хелпер `textAlignToLabelProps` из `style/text-align.ts` даёт `{ xalign, justification }` для GtkLabel |
| `transform`                                                                                           | частично   | классифицируется в `visual.transform` как есть; применяется layout-движком через матрицы `Fixed.Child`, в CSS не попадает                                                          |

## Цвета

| Формат                                     | Статус       | Примечание                                                                                                                                       |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| named colors (CSS Color 4), `transparent`  | поддержано   | нормализуются в `rgb()`/`rgba()`                                                                                                                 |
| `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` | поддержано   | нормализуются в `rgb()`/`rgba()`                                                                                                                 |
| `rgb()` / `rgba()`                         | поддержано   | запятая- и пробел-синтаксис (`rgb(255 0 0 / 0.5)`), каналы числом или в %                                                                        |
| `hsl()` / `hsla()`                         | поддержано   | hue числом или с `deg`, s/l строго в %; конвертируются в `rgb()`/`rgba()`                                                                        |
| `PlatformColor("accent-bg-color", ...)`    | поддержано   | → `var(--accent-bg-color, ...)`; Adwaita-переменные (libadwaita ≥ 1.6), имена с `@` — legacy GTK named colors, терминальны в цепочке fallback'ов |
| `var(--...)` / `@name` строкой             | поддержано   | passthrough без нормализации                                                                                                                     |
| невалидная строка                          | игнорируется | `parseColor` → `null`; в `visualStyleToCss` декларация выбрасывается с warn один раз на значение                                                 |

## Игнорируется (вне замороженного контракта)

Любой ключ, которого нет в `LayoutStyle`/`VisualStyle` (`boxShadow`, `elevation`, `zIndex`,
`textDecorationLine`, `textTransform`, `tintColor`, …) — `console.warn` один раз на ключ,
значение отбрасывается. Расширение набора — только через изменение `contracts.ts` оркестратором.
