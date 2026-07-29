// Dev-only warn-once helper shared by the style pipeline. Each unique key
// warns a single time per process — repeated renders stay silent.

const warned = new Set<string>()

export const warnOnce = (key: string, message: string): void => {
  if (process.env.NODE_ENV === "production") {
    return
  }
  if (warned.has(key)) {
    return
  }
  warned.add(key)
  console.warn(message)
}

// Test-only escape hatch: clears the warn-once registry between test cases.
export const resetDevWarnings = (): void => {
  warned.clear()
}
