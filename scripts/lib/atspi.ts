// AT-SPI (accessibility bus) helpers for verifying which window actually
// holds focus in a live GNOME session — used by gallery-shots-vm.ts to
// confirm the window Alt+Print is about to capture is the one this run
// launched, not whatever else happens to be focused.
//
// Why AT-SPI, not GNOME Shell's own window-listing API: org.gnome.Shell
// .Introspect (GetWindows / GetRunningApplications) is the obvious
// candidate, but both return AccessDenied to any caller outside GNOME's
// hardcoded allowlist — confirmed empirically over `gdbus call` against
// GNOME Shell 50.1 on the VM (`GetWindows is not allowed`,
// `GetRunningApplications is not allowed`). That lockdown exists on purpose,
// to stop arbitrary processes from enumerating other apps' windows, and a
// script is exactly the caller it exists to refuse. The xdg-desktop-portal
// Screenshot API was considered too: called non-interactively it grabs the
// whole screen (no per-window targeting, and no way to crop to one window
// without already knowing its on-screen geometry — which needs the same
// blocked introspection); called interactively it pops a picker, which is
// exactly the kind of driving of the live session this script must not do.
//
// AT-SPI is the accessibility bus every GTK app already registers on by
// default in this GNOME session (screen readers need full visibility into
// running apps, so it is not behind the same allowlist) and exposes exactly
// what is needed: given a PID, find its accessible application object, then
// read the standard ATSPI_STATE_ACTIVE bit off its top-level window — true
// only for the window that actually has focus in the compositor.
import { spawnSync } from "node:child_process"

// Index 1 in the AT-SPI StateType enum (atspi-constants.h) — a 64-bit state
// set returned as two uint32 words; ACTIVE always falls in the low word.
const ATSPI_STATE_ACTIVE = 1 << 1

/** Resolves the session's accessibility bus address, or undefined if none is reachable. */
export const atspiAddress = (): string | undefined => {
  const result = spawnSync(
    "gdbus",
    [
      "call",
      "--session",
      "--dest",
      "org.a11y.Bus",
      "--object-path",
      "/org/a11y/bus",
      "--method",
      "org.a11y.Bus.GetAddress",
    ],
    { encoding: "utf8" },
  )
  if (result.status !== 0) {
    return undefined
  }
  return /'([^']*)'/.exec(result.stdout)?.[1]
}

const call = (
  address: string,
  dest: string,
  path: string,
  iface: string,
  method: string,
  args: string[] = [],
): string | undefined => {
  const result = spawnSync(
    "gdbus",
    [
      "call",
      "--address",
      address,
      "--dest",
      dest,
      "--object-path",
      path,
      "--method",
      `${iface}.${method}`,
      ...args,
    ],
    { encoding: "utf8" },
  )
  return result.status === 0 ? result.stdout : undefined
}

/**
 * Finds the AT-SPI sender (a unique D-Bus name like ":1.293") whose
 * connection belongs to the given PID, by walking the registry's top-level
 * application list and asking the bus itself who owns each connection.
 * Returns undefined if the PID hasn't registered (yet, or at all).
 */
export const findAtspiSenderForPid = (
  address: string,
  pid: number,
): string | undefined => {
  const children = call(
    address,
    "org.a11y.atspi.Registry",
    "/org/a11y/atspi/accessible/root",
    "org.a11y.atspi.Accessible",
    "GetChildren",
  )
  if (!children) {
    return undefined
  }
  const senders = new Set(
    [...children.matchAll(/'(:[\d.]+)'/g)].flatMap((match) =>
      match[1] ? [match[1]] : [],
    ),
  )
  for (const sender of senders) {
    const reply = call(
      address,
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
      "GetConnectionUnixProcessID",
      [sender],
    )
    const ownerPid = reply && /\(uint32 (\d+),\)/.exec(reply)?.[1]
    if (ownerPid && Number(ownerPid) === pid) {
      return sender
    }
  }
  return undefined
}

/**
 * True if the given AT-SPI application (as found by findAtspiSenderForPid)
 * has a top-level window currently holding ATSPI_STATE_ACTIVE — i.e. it is
 * the window with focus, not merely a window that exists.
 */
export const isAtspiSenderActive = (
  address: string,
  sender: string,
): boolean => {
  const children = call(
    address,
    sender,
    "/org/a11y/atspi/accessible/root",
    "org.a11y.atspi.Accessible",
    "GetChildren",
  )
  const framePath = children && /'(\/[^']*)'/.exec(children)?.[1]
  if (!framePath) {
    return false
  }
  const states = call(
    address,
    sender,
    framePath,
    "org.a11y.atspi.Accessible",
    "GetState",
  )
  const lowWord = states && /\[uint32 (\d+),/.exec(states)?.[1]
  return lowWord !== undefined && (Number(lowWord) & ATSPI_STATE_ACTIVE) !== 0
}
