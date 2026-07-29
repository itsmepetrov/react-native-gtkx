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
      subtitle="RN Modal как настоящее модальное окно GTK; transparent и animationType приняты для совместимости, но на десктопе — no-op."
    >
      <DemoCard
        title="Базовый Modal"
        hint="visible контролируется стейтом; крестик окна вызывает onRequestClose — закрываем сами"
      >
        <Button
          label="открыть модалку"
          onPress={() => setBasicVisible(true)}
        />
        <Text style={styles.status}>
          onRequestClose суммарно: {closeRequests}
        </Text>
      </DemoCard>

      <DemoCard
        title="Свои размеры окна"
        hint="width: 360, height: 260 — размеры GtkWindow по умолчанию, окно можно ресайзить"
      >
        <Button
          label="открыть компактную модалку"
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
            Это настоящее модальное окно GTK: transient for родительского окна,
            родитель заблокирован. Внутри — обычное RN-дерево, окно можно
            ресайзить.
          </Text>
          <Button
            label="закрыть"
            onPress={() => setBasicVisible(false)}
          />
        </View>
      </Modal>

      <Modal
        visible={sizedVisible}
        title="Компактная модалка"
        width={360}
        height={260}
        onRequestClose={() => setSizedVisible(false)}
      >
        <View style={styles.modalBody}>
          <Text style={styles.modalText}>360 × 260</Text>
          <Caption>
            animationType и transparent приняты как no-op — у десктопных окон
            нет slide/fade.
          </Caption>
          <Button
            label="закрыть"
            onPress={() => setSizedVisible(false)}
          />
        </View>
      </Modal>
    </Section>
  )
}
