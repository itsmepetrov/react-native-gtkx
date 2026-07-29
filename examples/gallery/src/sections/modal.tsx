// Modal → a modal GtkWindow (transient for the parent window) hosting a
// regular RN tree with its own Root. Visibility is fully controlled by the
// visible prop; the window close is intercepted and reported via
// onRequestClose.
import { useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  button: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
  },
  buttonText: {
    color: palette.text,
    fontWeight: "700",
  },
  status: {
    color: palette.textDim,
    fontSize: 12,
  },
  modalBody: {
    flex: 1,
    padding: 20,
    gap: 12,
    backgroundColor: palette.window,
    justifyContent: "center",
  },
  modalText: {
    color: palette.text,
    fontSize: 14,
    textAlign: "center",
  },
})

const Button = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    onPress={onPress}
  >
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
)

export const ModalSection = () => {
  const [basicVisible, setBasicVisible] = useState(false)
  const [sizedVisible, setSizedVisible] = useState(false)
  const [closeRequests, setCloseRequests] = useState(0)

  return (
    <Section
      title="Modal"
      subtitle="RN Modal as a real modal GTK window; transparent and animationType are accepted for compatibility but are a no-op on desktop."
    >
      <DemoCard
        title="Basic Modal"
        hint="visible is controlled by state; the window close button triggers onRequestClose — we close it ourselves"
      >
        <Button
          label="open modal"
          onPress={() => setBasicVisible(true)}
        />
        <Text style={styles.status}>onRequestClose total: {closeRequests}</Text>
      </DemoCard>

      <DemoCard
        title="Custom window size"
        hint="width: 360, height: 260 — the default GtkWindow size, the window can be resized"
      >
        <Button
          label="open compact modal"
          onPress={() => setSizedVisible(true)}
        />
      </DemoCard>

      <Modal
        visible={basicVisible}
        title="Modal — GtkWindow"
        animationType="fade"
        onRequestClose={() => {
          setCloseRequests((n) => n + 1)
          setBasicVisible(false)
        }}
      >
        <View style={styles.modalBody}>
          <Text style={styles.modalText}>
            This is a real modal GTK window: transient for the parent window,
            which stays blocked. Inside is a regular RN tree, and the window can
            be resized.
          </Text>
          <Button
            label="close"
            onPress={() => setBasicVisible(false)}
          />
        </View>
      </Modal>

      <Modal
        visible={sizedVisible}
        title="Compact modal"
        width={360}
        height={260}
        onRequestClose={() => setSizedVisible(false)}
      >
        <View style={styles.modalBody}>
          <Text style={styles.modalText}>360 × 260</Text>
          <Caption>
            animationType and transparent are accepted as a no-op — desktop
            windows have no slide/fade.
          </Caption>
          <Button
            label="close"
            onPress={() => setSizedVisible(false)}
          />
        </View>
      </Modal>
    </Section>
  )
}
