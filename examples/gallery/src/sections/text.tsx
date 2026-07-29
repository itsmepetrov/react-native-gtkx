// Text: sizes and weights, textAlign, numberOfLines/wrapping, lineHeight,
// letterSpacing, PlatformColor. Honest v1 limitation: nested Text spans with
// their own styles are not supported — children are flattened into one string.
import { PlatformColor, StyleSheet, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const LOREM =
  "Pango измеряет этот абзац для Yoga: перенос строк происходит ровно там, " +
  "где движок раскладки посчитал ширину, а GtkLabel лишь отрисовывает результат."

const styles = StyleSheet.create({
  base: {
    color: palette.text,
  },
  dim: {
    color: palette.textDim,
    fontSize: 13,
  },
  alignBox: {
    backgroundColor: palette.cardAlt,
    borderRadius: 6,
    padding: 8,
    gap: 6,
  },
})

export const TextSection = () => (
  <Section
    title="Text"
    subtitle="GtkLabel c метриками Pango: типографика через стили, выравнивание, обрезка numberOfLines. Вложенные стилизованные спаны в v1 не поддерживаются (плоская конкатенация детей)."
  >
    <DemoCard
      title="fontSize"
      hint="12 / 16 / 22 / 28 px"
    >
      {[12, 16, 22, 28].map((size) => (
        <Text
          key={size}
          style={[styles.base, { fontSize: size }]}
        >
          fontSize: {size} — Съешь ещё этих мягких булок
        </Text>
      ))}
    </DemoCard>

    <DemoCard
      title="fontWeight и fontStyle"
      hint='ключевые слова и числовые строки "100"–"900"; курсив через fontStyle'
    >
      <Text style={[styles.base, { fontWeight: "300" }]}>
        fontWeight: “300” — light
      </Text>
      <Text style={styles.base}>fontWeight: normal (по умолчанию)</Text>
      <Text style={[styles.base, { fontWeight: "600" }]}>
        fontWeight: “600” — semibold
      </Text>
      <Text style={[styles.base, { fontWeight: "bold" }]}>
        fontWeight: “bold”
      </Text>
      <Text style={[styles.base, { fontStyle: "italic" }]}>
        fontStyle: “italic”
      </Text>
      <Text style={[styles.base, { fontFamily: "Monospace", fontSize: 13 }]}>
        fontFamily: “Monospace”
      </Text>
    </DemoCard>

    <DemoCard
      title="textAlign"
      hint="left / center / right / justify — xalign + justification на GtkLabel, не CSS"
    >
      <View style={styles.alignBox}>
        <Text style={[styles.base, { textAlign: "left" }]}>
          textAlign: left
        </Text>
        <Text style={[styles.base, { textAlign: "center" }]}>
          textAlign: center
        </Text>
        <Text style={[styles.base, { textAlign: "right" }]}>
          textAlign: right
        </Text>
        <Text style={[styles.dim, { textAlign: "justify" }]}>
          textAlign: justify — {LOREM}
        </Text>
      </View>
    </DemoCard>

    <DemoCard
      title="numberOfLines и переносы"
      hint="без ограничения текст переносится по ширине; с numberOfLines — эллипсис в конце последней строки"
    >
      <Caption>Без ограничения (перенос по ширине карточки):</Caption>
      <Text style={styles.dim}>{LOREM}</Text>
      <Caption>numberOfLines: 1</Caption>
      <Text
        style={styles.dim}
        numberOfLines={1}
      >
        {LOREM}
      </Text>
      <Caption>numberOfLines: 2</Caption>
      <Text
        style={styles.dim}
        numberOfLines={2}
      >
        {LOREM} {LOREM}
      </Text>
    </DemoCard>

    <DemoCard
      title="lineHeight и letterSpacing"
      hint="line-height в px (GTK ≥ 4.6); letter-spacing в px"
    >
      <Caption>lineHeight: 16 (плотно):</Caption>
      <Text style={[styles.dim, { lineHeight: 16 }]}>{LOREM}</Text>
      <Caption>lineHeight: 26 (разреженно):</Caption>
      <Text style={[styles.dim, { lineHeight: 26 }]}>{LOREM}</Text>
      <Caption>letterSpacing: 3</Caption>
      <Text style={[styles.base, { letterSpacing: 3 }]}>
        Р А З Р Я Д К А через letterSpacing
      </Text>
    </DemoCard>

    <DemoCard
      title="PlatformColor"
      hint='PlatformColor("accent-fg-color", "@blue_3") → var(--accent-fg-color, @blue_3): цвет берётся из темы Adwaita'
    >
      <Text
        style={{
          color: PlatformColor("accent-fg-color", "@blue_3"),
          fontWeight: "700",
        }}
      >
        Этот текст покрашен акцентным цветом текущей темы
      </Text>
      <Text style={{ color: PlatformColor("success-color", "@green_3") }}>
        А этот — success-color с fallback на @green_3
      </Text>
    </DemoCard>

    <DemoCard
      title="Плоская конкатенация детей"
      hint="дети Text склеиваются в одну строку; стили вложенного спана в v1 игнорируются — честное ограничение"
    >
      <Text style={styles.base}>
        Число: {42}, строка: {"из выражения"}, всё это — один GtkLabel.
      </Text>
    </DemoCard>
  </Section>
)
