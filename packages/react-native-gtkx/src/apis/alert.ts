import type { AlertButtonStyle, AlertHost, HostAlertButton } from "./host.js"

export type AlertButton = {
  text?: string
  onPress?: (value?: string) => void
  isPreferred?: boolean
  style?: AlertButtonStyle
}

export type AlertOptions = {
  cancelable?: boolean
  onDismiss?: () => void
  // Accepted for react-native parity; ignored here — the theme is controlled
  // globally via Appearance/AdwStyleManager.
  userInterfaceStyle?: "unspecified" | "light" | "dark"
}

export const createAlert = (host: AlertHost) => {
  // Fire-and-forget like react-native's Alert.alert: the pressed button's
  // onPress (or options.onDismiss) is called when the dialog resolves.
  const alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ): void => {
    const effective: AlertButton[] =
      buttons !== undefined && buttons.length > 0 ? buttons : [{ text: "OK" }]
    const hostButtons: HostAlertButton[] = effective.map((button, index) => ({
      id: String(index),
      label: button.text ?? "",
      style: button.style ?? "default",
      isPreferred: button.isPreferred ?? false,
    }))
    void host
      .showAlert({
        title,
        message,
        buttons: hostButtons,
        cancelable: options?.cancelable ?? true,
      })
      .then((responseId) => {
        const pressed =
          responseId === null ? undefined : effective[Number(responseId)]
        if (pressed) {
          pressed.onPress?.()
          return
        }
        options?.onDismiss?.()
      })
      .catch((error: unknown) => {
        console.error("[react-native-gtkx] Alert.alert failed:", error)
      })
  }

  return { alert }
}

export type AlertModule = ReturnType<typeof createAlert>
