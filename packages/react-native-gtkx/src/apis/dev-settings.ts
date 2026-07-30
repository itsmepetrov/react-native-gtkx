// RN DevSettings for the linux platform. In dev mode (`run-linux --dev`)
// the dev host installs the reload hook and shows registered items in the
// Dev Menu (Ctrl+Shift+D); in release builds neither exists, so every call
// is a silent no-op — the same contract as RN release builds. The globals
// are declared in ../runner/globals.d.ts (the host↔bundle bridge).

export const DevSettings = {
  /**
   * Adds an entry to the Dev Menu. Registering the same title again
   * replaces the previous handler (RN semantics).
   */
  addMenuItem(title: string, handler: () => void): void {
    const items = (globalThis.__rnGtkxDevMenuItems ??= [])
    const existing = items.findIndex((item) => item.title === title)
    if (existing >= 0) {
      items[existing] = { title, handler }
      return
    }
    items.push({ title, handler })
  },

  /** Reloads the application (dev mode only; a no-op in release). */
  reload(reason?: string): void {
    globalThis.__rnGtkxDevHost?.reload(reason)
  },
}
