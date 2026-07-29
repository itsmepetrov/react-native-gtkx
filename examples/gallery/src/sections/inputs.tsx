// TextInput → GtkEntry: placeholder, controlled echo, secureTextEntry,
// keyboardType (inputPurpose), editable=false, defaultValue, submit/focus.
// Honest v1 limitation: multiline does not render — always a single-line
// GtkEntry (GtkTextView is roadmap branch H).
import { useState } from "react"
import { StyleSheet, Text, TextInput, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  echo: {
    color: "#8ff0a4",
    fontSize: 13,
  },
  status: {
    color: palette.textDim,
    fontSize: 12,
  },
  limitation: {
    color: "#f8e45c",
    fontSize: 12,
  },
})

export const InputsSection = () => {
  const [text, setText] = useState("")
  const [password, setPassword] = useState("")
  const [submitted, setSubmitted] = useState("(ещё не было)")
  const [focusState, setFocusState] = useState("blur")

  return (
    <Section
      title="Inputs"
      subtitle="TextInput поверх GtkEntry: контролируемое значение, плейсхолдеры, скрытый ввод, типы клавиатуры, неактивное поле."
    >
      <DemoCard
        title="Контролируемый ввод + echo"
        hint="value/onChangeText; onSubmitEditing по Enter; onFocus/onBlur через EventControllerFocus"
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="напишите что-нибудь…"
          onSubmitEditing={({ nativeEvent }) => setSubmitted(nativeEvent.text)}
          onFocus={() => setFocusState("focus")}
          onBlur={() => setFocusState("blur")}
        />
        <Text style={styles.echo}>echo: {text || "(пусто)"}</Text>
        <Text style={styles.status}>
          последний submit (Enter): {submitted} · фокус: {focusState}
        </Text>
      </DemoCard>

      <DemoCard
        title="secureTextEntry"
        hint="visibility=false у GtkEntry: символы скрыты, значение остаётся контролируемым"
      >
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="пароль"
          secureTextEntry
        />
        <Text style={styles.status}>длина: {password.length} символов</Text>
      </DemoCard>

      <DemoCard
        title="keyboardType"
        hint="маппится в Gtk.InputPurpose — подсказка методам ввода, а не фильтр символов"
      >
        <Caption>numeric</Caption>
        <TextInput
          defaultValue="12345"
          keyboardType="numeric"
        />
        <Caption>email-address</Caption>
        <TextInput
          placeholder="user@example.org"
          keyboardType="email-address"
        />
        <Caption>url</Caption>
        <TextInput
          placeholder="https://gtk.org"
          keyboardType="url"
        />
        <Caption>phone-pad</Caption>
        <TextInput
          placeholder="+7 900 000-00-00"
          keyboardType="phone-pad"
        />
      </DemoCard>

      <DemoCard
        title="editable: false"
        hint="поле неактивно (sensitive=false) и не редактируется"
      >
        <TextInput
          defaultValue="это значение нельзя изменить"
          editable={false}
        />
      </DemoCard>

      <DemoCard
        title="defaultValue (неконтролируемый)"
        hint="начальное значение задаётся один раз, дальше виджет живёт своей жизнью"
      >
        <TextInput
          defaultValue="стартовый текст"
          placeholder="…"
        />
        <View>
          <Text style={styles.limitation}>
            Ограничение v1: multiline не поддерживается — TextInput всегда
            рендерится однострочным GtkEntry (GtkTextView — ветка H роадмапа).
          </Text>
        </View>
      </DemoCard>
    </Section>
  )
}
