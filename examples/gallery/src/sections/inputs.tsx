// TextInput → GtkEntry: placeholder, controlled echo, secureTextEntry,
// keyboardType (inputPurpose), editable=false, defaultValue, submit/focus.
// Honest v1 limitation: multiline does not render — always a single-line
// GtkEntry (GtkTextView is roadmap branch H).
import { useState } from "react"
import { StyleSheet, Text, TextInput } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  echo: {
    color: palette.success,
    fontSize: 13,
  },
  status: {
    color: palette.textDim,
    fontSize: 12,
  },
  limitation: {
    color: palette.warning,
    fontSize: 12,
  },
})

export const InputsSection = () => {
  const [text, setText] = useState("")
  const [password, setPassword] = useState("")
  const [note, setNote] = useState(
    "Multiline text input.\nEnter adds a new line.",
  )
  const [submitted, setSubmitted] = useState("(none yet)")
  const [focusState, setFocusState] = useState("blur")

  return (
    <Section
      title="Inputs"
      subtitle="TextInput on top of GtkEntry (single line) and GtkTextView (multiline): controlled value, placeholders, hidden input, keyboard types, disabled field."
    >
      <DemoCard
        title="Controlled input + echo"
        hint="value/onChangeText; onSubmitEditing on Enter; onFocus/onBlur via EventControllerFocus"
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="type something…"
          onSubmitEditing={({ nativeEvent }) => setSubmitted(nativeEvent.text)}
          onFocus={() => setFocusState("focus")}
          onBlur={() => setFocusState("blur")}
        />
        <Text style={styles.echo}>echo: {text || "(empty)"}</Text>
        <Text style={styles.status}>
          last submit (Enter): {submitted} · focus: {focusState}
        </Text>
      </DemoCard>

      <DemoCard
        title="secureTextEntry"
        hint="visibility=false on GtkEntry: characters are hidden, the value stays controlled"
      >
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="password"
          secureTextEntry
        />
        <Text style={styles.status}>length: {password.length} characters</Text>
      </DemoCard>

      <DemoCard
        title="keyboardType"
        hint="maps to Gtk.InputPurpose — a hint for input methods, not a character filter"
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
        hint="the field is inactive (sensitive=false) and cannot be edited"
      >
        <TextInput
          defaultValue="this value cannot be changed"
          editable={false}
        />
      </DemoCard>

      <DemoCard
        title="defaultValue (uncontrolled)"
        hint="the initial value is set once, after that the widget lives its own life"
      >
        <TextInput
          defaultValue="initial text"
          placeholder="…"
        />
      </DemoCard>

      <DemoCard
        title="multiline"
        hint="a real GtkTextView with word wrap: the style sets the box, longer text scrolls inside; Enter inserts a newline (RN semantics — no onSubmitEditing)"
      >
        <TextInput
          multiline
          defaultValue={"Multiline text input.\nEnter adds a new line."}
          onChangeText={setNote}
          placeholder="Write a note…"
          style={{ height: 110 }}
        />
        <Text
          style={styles.status}
        >{`note length: ${note.length} characters`}</Text>
      </DemoCard>
    </Section>
  )
}
