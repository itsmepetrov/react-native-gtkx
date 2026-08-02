// Real pointer input for the GTK tests.
//
// Why this exists: `@gtkx/testing`'s `userEvent` drives widgets by EMITTING
// GtkGesture signals on the controllers of the widget you name. That covers
// everything from the gesture signal inward, and nothing outward — a
// GdkEvent is never produced, so the hop that actually matters in
// production (compositor -> GDK -> GtkGesture) is untested. `Pressable` has
// relied on that hop since the beginning; so does the responder system.
//
// The gap turned out to be small. `@gtkx/vitest` already opens a raw
// Wayland connection to its headless compositor and binds
// `zwlr_virtual_pointer_manager_v1`, calling `create_device` so the
// compositor advertises pointer capability to GTK — it simply never sends
// anything through it. This module speaks the same wire protocol and sends
// the three requests it was missing: `motion_absolute`, `button`, `frame`.
//
// Everything here is deliberately minimal hand-rolled Wayland: one socket,
// two globals, one object. It belongs upstream in @gtkx/testing eventually
// (docs/upstream-gtkx.md); it lives here until it has proven itself.
import { connect, type Socket } from "node:net"
import { join } from "node:path"

const DISPLAY_ID = 1
const REGISTRY_ID = 2
const FIRST_CLIENT_ID = 3
const HEADER_SIZE = 8
const WORD_SIZE = 4
const OPCODE_MASK = 0xff_ff

// wl_display
const DISPLAY_SYNC = 0
const DISPLAY_GET_REGISTRY = 1
const DISPLAY_ERROR_EVENT = 0
// wl_registry
const REGISTRY_BIND = 0
const REGISTRY_GLOBAL_EVENT = 0
// zwlr_virtual_pointer_manager_v1
const MANAGER_CREATE_POINTER = 0
// zwlr_virtual_pointer_v1
const POINTER_MOTION_ABSOLUTE = 1
const POINTER_BUTTON = 2
const POINTER_AXIS = 3
const POINTER_FRAME = 4
const POINTER_AXIS_SOURCE = 5
const POINTER_AXIS_STOP = 6
const POINTER_AXIS_DISCRETE = 7

// wl_pointer.axis
const AXIS_VERTICAL_SCROLL = 0
// wl_pointer.axis_source
const AXIS_SOURCE_WHEEL = 0
/**
 * A touchpad two-finger glide. The distinction from a wheel is the whole
 * point of this constant: libinput reports a wheel as DISCRETE detents with
 * no beginning and no end, and a finger as a CONTINUOUS stream terminated by
 * `axis_stop` — which is the only thing on this platform that gives GDK a
 * scroll sequence to bracket, and therefore the only source of a scroll
 * PHASE (docs/research/scroll-phases.md).
 */
const AXIS_SOURCE_FINGER = 1
/** One wheel detent, in the units libinput reports for a discrete wheel. */
const WHEEL_STEP = 15
/** wl_fixed_t is 24.8 fixed point. */
const toFixed = (value: number): number => Math.round(value * 256)

const SEAT_INTERFACE = "wl_seat"
const POINTER_MANAGER_INTERFACE = "zwlr_virtual_pointer_manager_v1"

/** linux/input-event-codes.h */
const BTN_LEFT = 0x110
const BTN_RIGHT = 0x111
const BUTTON_RELEASED = 0
const BUTTON_PRESSED = 1

/**
 * Which physical button. `"secondary"` is what a context menu is on this
 * platform — there is no `contextmenu` event in GDK, so a right press is
 * both the trigger an app sees and the one a test has to send.
 */
export type PointerButton = "primary" | "secondary"

const BUTTON_CODES: Record<PointerButton, number> = {
  primary: BTN_LEFT,
  secondary: BTN_RIGHT,
}

export class VirtualPointerUnavailable extends Error {}

type Global = { name: number; version: number }

type Connection = {
  socket: Socket
  globals: Map<string, Global>
  pending: Map<number, { resolve: () => void; reject: (error: Error) => void }>
  inbox: Buffer
  nextId: number
}

const align4 = (size: number): number => (size + 3) & ~3

const encodeString = (value: string): Buffer => {
  const bytes = Buffer.from(`${value}\0`, "utf8")
  const encoded = Buffer.alloc(WORD_SIZE + align4(bytes.length))
  encoded.writeUInt32LE(bytes.length, 0)
  bytes.copy(encoded, WORD_SIZE)
  return encoded
}

const encodeArgument = (argument: number | string): Buffer => {
  if (typeof argument === "string") {
    return encodeString(argument)
  }
  const encoded = Buffer.alloc(WORD_SIZE)
  // `>>> 0` is what lets a SIGNED argument through. Wayland words are 32 bits
  // and the protocol's `int` and `uint` share the encoding, but Node's
  // `writeUInt32LE` throws `ERR_OUT_OF_RANGE` on anything negative — so a
  // `wl_fixed` axis value for a scroll UP never reached the wire, and
  // scrolling up could not be injected at all. The shift reinterprets the
  // two's complement bits without touching any value that was already in
  // range.
  encoded.writeUInt32LE(argument >>> 0, 0)
  return encoded
}

const sendRequest = (
  connection: Connection,
  objectId: number,
  opcode: number,
  args: (number | string)[],
): void => {
  const body = Buffer.concat(args.map(encodeArgument))
  const header = Buffer.alloc(HEADER_SIZE)
  header.writeUInt32LE(objectId, 0)
  header.writeUInt32LE(((body.length + HEADER_SIZE) << 16) | opcode, WORD_SIZE)
  connection.socket.write(Buffer.concat([header, body]))
}

const readString = (body: Buffer, offset: number): string => {
  const length = body.readUInt32LE(offset)
  return body
    .subarray(offset + WORD_SIZE, offset + WORD_SIZE + length - 1)
    .toString("utf8")
}

const allocateId = (connection: Connection): number => {
  const id = connection.nextId
  connection.nextId += 1
  return id
}

const storeGlobal = (connection: Connection, body: Buffer): void => {
  const name = body.readUInt32LE(0)
  const interfaceName = readString(body, WORD_SIZE)
  const versionOffset = WORD_SIZE * 2 + align4(interfaceName.length + 1)
  connection.globals.set(interfaceName, {
    name,
    version: body.readUInt32LE(versionOffset),
  })
}

const rejectAll = (connection: Connection, error: Error): void => {
  for (const callback of connection.pending.values()) {
    callback.reject(error)
  }
  connection.pending.clear()
}

const handleEvent = (
  connection: Connection,
  objectId: number,
  opcode: number,
  body: Buffer,
): void => {
  if (objectId === DISPLAY_ID && opcode === DISPLAY_ERROR_EVENT) {
    rejectAll(
      connection,
      new Error(`virtual pointer rejected: ${readString(body, HEADER_SIZE)}`),
    )
    return
  }
  if (objectId === REGISTRY_ID && opcode === REGISTRY_GLOBAL_EVENT) {
    storeGlobal(connection, body)
    return
  }
  const callback = connection.pending.get(objectId)
  if (callback) {
    connection.pending.delete(objectId)
    callback.resolve()
  }
}

const consume = (connection: Connection): void => {
  while (connection.inbox.length >= HEADER_SIZE) {
    const objectId = connection.inbox.readUInt32LE(0)
    const word = connection.inbox.readUInt32LE(WORD_SIZE)
    const size = word >>> 16
    if (size < HEADER_SIZE || connection.inbox.length < size) {
      return
    }
    handleEvent(
      connection,
      objectId,
      word & OPCODE_MASK,
      connection.inbox.subarray(HEADER_SIZE, size),
    )
    connection.inbox = connection.inbox.subarray(size)
  }
}

const open = (socketPath: string): Promise<Connection> =>
  new Promise((resolve, reject) => {
    const socket = connect(socketPath)
    const connection: Connection = {
      socket,
      globals: new Map(),
      pending: new Map(),
      inbox: Buffer.alloc(0),
      nextId: FIRST_CLIENT_ID,
    }
    socket.on("data", (chunk: Buffer) => {
      connection.inbox = Buffer.concat([connection.inbox, chunk])
      consume(connection)
    })
    socket.on("error", (error) => {
      reject(error)
      rejectAll(connection, error)
    })
    socket.once("connect", () => {
      resolve(connection)
    })
  })

const roundtrip = (connection: Connection): Promise<void> =>
  new Promise((resolve, reject) => {
    const callbackId = allocateId(connection)
    connection.pending.set(callbackId, { resolve, reject })
    sendRequest(connection, DISPLAY_ID, DISPLAY_SYNC, [callbackId])
  })

const bindGlobal = (
  connection: Connection,
  interfaceName: string,
  version: number,
): number => {
  const entry = connection.globals.get(interfaceName)
  if (entry === undefined) {
    throw new VirtualPointerUnavailable(
      `the headless compositor does not implement ${interfaceName}`,
    )
  }
  const id = allocateId(connection)
  sendRequest(connection, REGISTRY_ID, REGISTRY_BIND, [
    entry.name,
    interfaceName,
    Math.min(version, entry.version),
    id,
  ])
  return id
}

export type VirtualPointer = {
  /** Absolute position, in output pixels. */
  moveTo(x: number, y: number): void
  press(button?: PointerButton): void
  release(button?: PointerButton): void
  /** Vertical wheel, in detents; positive scrolls down, negative up. */
  scrollBy(detents: number): void
  /**
   * One step of a touchpad two-finger glide, in pixels; positive scrolls
   * down. Continuous and unterminated — the sequence is only finished by
   * {@link VirtualPointer.glideEnd}, which is what makes it a scroll with a
   * beginning and an end rather than a detent.
   */
  glideBy(pixels: number): void
  /** Lifts the fingers: `wl_pointer.axis_stop` on the vertical axis. */
  glideEnd(): void
  dispose(): void
}

export type VirtualPointerOptions = {
  /** Output size the coordinates are expressed in. */
  width: number
  height: number
}

/**
 * Opens a second Wayland connection to the compositor this worker already
 * runs against and creates a virtual pointer on it.
 *
 * Throws {@link VirtualPointerUnavailable} when the compositor has no
 * `zwlr_virtual_pointer_manager_v1` (weston, for instance), so a test can
 * skip rather than fail on an environment difference.
 */
export const createVirtualPointer = async (
  options: VirtualPointerOptions,
): Promise<VirtualPointer> => {
  const runtimeDir = process.env.XDG_RUNTIME_DIR
  const display = process.env.WAYLAND_DISPLAY
  if (!runtimeDir || !display) {
    throw new VirtualPointerUnavailable(
      "no XDG_RUNTIME_DIR/WAYLAND_DISPLAY — not running under the headless display",
    )
  }

  const connection = await open(join(runtimeDir, display))
  sendRequest(connection, DISPLAY_ID, DISPLAY_GET_REGISTRY, [REGISTRY_ID])
  await roundtrip(connection)

  const seat = bindGlobal(connection, SEAT_INTERFACE, 1)
  const manager = bindGlobal(connection, POINTER_MANAGER_INTERFACE, 1)
  const pointer = allocateId(connection)
  sendRequest(connection, manager, MANAGER_CREATE_POINTER, [seat, pointer])
  await roundtrip(connection)

  // The compositor stamps events with this; it only has to advance.
  let time = 1

  const frame = (): void => {
    sendRequest(connection, pointer, POINTER_FRAME, [])
  }

  return {
    moveTo(x, y) {
      time += 8
      sendRequest(connection, pointer, POINTER_MOTION_ABSOLUTE, [
        time,
        Math.round(x),
        Math.round(y),
        options.width,
        options.height,
      ])
      frame()
    },
    press(button = "primary") {
      time += 8
      sendRequest(connection, pointer, POINTER_BUTTON, [
        time,
        BUTTON_CODES[button],
        BUTTON_PRESSED,
      ])
      frame()
    },
    release(button = "primary") {
      time += 8
      sendRequest(connection, pointer, POINTER_BUTTON, [
        time,
        BUTTON_CODES[button],
        BUTTON_RELEASED,
      ])
      frame()
    },
    scrollBy(detents) {
      time += 8
      // The compositor needs all three to synthesize a wheel the way a real
      // one arrives: the source (so it is a wheel and not a touchpad glide),
      // the continuous value, and the detent count.
      sendRequest(connection, pointer, POINTER_AXIS_SOURCE, [AXIS_SOURCE_WHEEL])
      sendRequest(connection, pointer, POINTER_AXIS, [
        time,
        AXIS_VERTICAL_SCROLL,
        toFixed(detents * WHEEL_STEP),
      ])
      sendRequest(connection, pointer, POINTER_AXIS_DISCRETE, [
        time,
        AXIS_VERTICAL_SCROLL,
        toFixed(detents * WHEEL_STEP),
        detents,
      ])
      frame()
    },
    glideBy(pixels) {
      time += 8
      // No `axis_discrete`: that request is what tells the compositor the
      // motion came in detents, and it is exactly what a finger does not
      // have. Without it libinput's continuous value stands alone and GDK
      // builds a SMOOTH scroll event out of it.
      sendRequest(connection, pointer, POINTER_AXIS_SOURCE, [
        AXIS_SOURCE_FINGER,
      ])
      sendRequest(connection, pointer, POINTER_AXIS, [
        time,
        AXIS_VERTICAL_SCROLL,
        toFixed(pixels),
      ])
      frame()
    },
    glideEnd() {
      time += 8
      sendRequest(connection, pointer, POINTER_AXIS_SOURCE, [
        AXIS_SOURCE_FINGER,
      ])
      sendRequest(connection, pointer, POINTER_AXIS_STOP, [
        time,
        AXIS_VERTICAL_SCROLL,
      ])
      frame()
    },
    dispose() {
      connection.socket.destroy()
    },
  }
}
