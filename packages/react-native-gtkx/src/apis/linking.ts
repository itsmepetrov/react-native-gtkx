import type { SubscriptionHandle } from "../contracts"
import type { LinkingHost } from "./host"

// Schemes every Linux desktop resolves through the portal / default handlers.
// There is no per-handler introspection API comparable to canOpenURL on
// mobile, so the answer is static per scheme.
const SUPPORTED_SCHEMES = new Set(["http", "https", "mailto", "file"])

const schemeOf = (url: string): string | null => {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url)
  const scheme = match?.[1]
  return scheme === undefined ? null : scheme.toLowerCase()
}

export const createLinking = (host: LinkingHost) => ({
  // Opens the URL in the user's default handler (Gtk.UriLauncher → portal).
  openURL: (url: string): Promise<void> => {
    if (typeof url !== "string" || url.length === 0) {
      return Promise.reject(
        new Error("Linking.openURL: url must be a non-empty string"),
      )
    }
    return host.launchUri(url)
  },
  canOpenURL: (url: string): Promise<boolean> => {
    if (typeof url !== "string") {
      return Promise.reject(
        new Error("Linking.canOpenURL: url must be a string"),
      )
    }
    const scheme = schemeOf(url)
    return Promise.resolve(scheme !== null && SUPPORTED_SCHEMES.has(scheme))
  },
  // Desktop apps are not launched through deep links: always null.
  getInitialURL: (): Promise<string | null> => Promise.resolve(null),

  // RN parity for consumers that subscribe to incoming deep links
  // (react-navigation's useLinking does on mount). Nothing delivers "url"
  // events on desktop today — a future Gio.Application::open wiring would;
  // the subscription contract is honored so such consumers mount cleanly.
  addEventListener: (
    type: "url",
    handler: (event: { url: string }) => void,
  ): SubscriptionHandle => {
    void type
    void handler
    return { remove: () => {} }
  },
})

export type LinkingModule = ReturnType<typeof createLinking>
