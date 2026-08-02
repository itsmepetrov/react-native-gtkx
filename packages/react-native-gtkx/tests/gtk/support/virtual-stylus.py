#!/usr/bin/env python3
"""A virtual pressure-sensitive stylus/tablet on /dev/uinput, driven over stdin.

The other half of ./virtual-stylus.ts, which is the file to read first, and a
sibling of ./virtual-touchpad.py built the same way: the kernel is the
injection point, so libinput and the compositor above it classify the device as
real hardware and run their normal tablet code over it. Node has no ioctl,
hence Python; python3-evdev wraps UI_DEV_SETUP/UI_SET_EVBIT/... .

The device shape is a Wacom Intuos5 touch M pen tablet, copied from libinput's
own litest descriptor (litest-device-wacom-intuos5-pen.c) down to the USB ids.
Two things in that shape are load-bearing:

  * BTN_TOOL_PEN together with ABS_X/ABS_Y is precisely what systemd-udev's
    input_id builtin keys ID_INPUT_TABLET off, and ID_INPUT_TABLET is what
    makes libinput build a tablet dispatch instead of a pointer one.
  * INPUT_PROP_POINTER marks it an *external* tablet (an Intuos, not a Cintiq),
    which is what makes the compositor map the whole tablet area onto the whole
    screen. A device tagged INPUT_PROP_DIRECT would want an output to be bound
    to, and gets no sensible mapping on a VM with no real tablet configured.

Coordinates on stdin are fractions 0..1 of the tablet area, so 0.5 0.5 is the
middle of the screen; pressure is likewise a fraction 0..1 of the axis range.

    prox_in <x> <y>                          BTN_TOOL_PEN down, pressure 0
    move <x> <y> <p>                         one frame
    ramp <x0> <y0> <x1> <y1> <p0> <p1> <n>   n frames, pressure interpolated
    prox_out
    quit

Protocol otherwise matches ./virtual-touchpad.py exactly: one command per line
on stdin, one `ok` per command on stdout once the injected sequence has been
written and flushed, and one `ready` before any of it.
"""

import sys
import time

from evdev import AbsInfo, UInput
from evdev import ecodes as e

# Intuos5 touch M: 223.5mm x 139.7mm at 200 units/mm. libinput wants the
# resolution to convert to millimetres; without it, it warns and guesses.
RESOLUTION = 200
X_MAX = 44704
Y_MAX = 27940
# The absolute pressure range is arbitrary as far as the stack is concerned --
# libinput normalises pressure to 0.0..1.0 against this range, and the Wayland
# tablet protocol re-quantises to 0..65535 on the wire -- but a wide range
# makes a lost low bit obvious rather than invisible.
PRESSURE_MAX = 65535
DISTANCE_MAX = 63
TILT_MIN, TILT_MAX = -64, 63

CAPABILITIES = {
    e.EV_KEY: [
        e.BTN_TOOL_PEN,
        e.BTN_TOOL_RUBBER,
        e.BTN_TOOL_BRUSH,
        e.BTN_TOOL_PENCIL,
        e.BTN_TOOL_AIRBRUSH,
        e.BTN_TOUCH,
        e.BTN_STYLUS,
        e.BTN_STYLUS2,
    ],
    e.EV_ABS: [
        (e.ABS_X, AbsInfo(0, 0, X_MAX, 4, 0, RESOLUTION)),
        (e.ABS_Y, AbsInfo(0, 0, Y_MAX, 4, 0, RESOLUTION)),
        (e.ABS_PRESSURE, AbsInfo(0, 0, PRESSURE_MAX, 0, 0, 0)),
        (e.ABS_DISTANCE, AbsInfo(0, 0, DISTANCE_MAX, 0, 0, 0)),
        (e.ABS_TILT_X, AbsInfo(0, TILT_MIN, TILT_MAX, 0, 0, 57)),
        (e.ABS_TILT_Y, AbsInfo(0, TILT_MIN, TILT_MAX, 0, 0, 57)),
        (e.ABS_MISC, AbsInfo(0, 0, 0, 0, 0, 0)),
    ],
    # MSC_SERIAL is how a tablet identifies *which* pen is on it. libinput
    # turns it into the tool serial, and the compositor into a GdkDeviceTool.
    e.EV_MSC: [e.MSC_SERIAL],
}

FRAME_MS = 12
# Any non-zero serial; 0 means "no serial reported" to libinput.
TOOL_SERIAL = 0x00BEEF01
# ABS_MISC carries the Wacom tool id. 0x0802 is the Intuos Grip Pen, which is
# what litest reports; libinput maps it to LIBINPUT_TABLET_TOOL_TYPE_PEN.
TOOL_ID = 0x0802


class Stylus:
    def __init__(self):
        self.ui = UInput(
            CAPABILITIES,
            name="rn-gtkx virtual stylus",
            # Wacom's vendor id with the Intuos5 touch M product id. Claiming a
            # tablet libwacom already knows means libinput gets a real entry
            # out of its database instead of logging "device is not known".
            vendor=0x056A,
            product=0x0027,
            version=0x0110,
            phys="rn-gtkx/virtual-stylus/input0",
            input_props=[e.INPUT_PROP_POINTER],
        )
        self.in_proximity = False

    def sync(self):
        self.ui.syn()
        time.sleep(FRAME_MS / 1000)

    @staticmethod
    def _abs(frac, maximum):
        return max(0, min(maximum, int(round(frac * maximum))))

    def prox_in(self, x, y):
        self.ui.write(e.EV_ABS, e.ABS_X, self._abs(x, X_MAX))
        self.ui.write(e.EV_ABS, e.ABS_Y, self._abs(y, Y_MAX))
        self.ui.write(e.EV_ABS, e.ABS_DISTANCE, 20)
        # Proximity must be entered at zero pressure. libinput watches the
        # first in-proximity frames for a non-zero resting pressure and, if it
        # sees one, decides the pen has a miscalibrated tip and silently
        # subtracts that value as an offset from everything that follows.
        self.ui.write(e.EV_ABS, e.ABS_PRESSURE, 0)
        self.ui.write(e.EV_ABS, e.ABS_TILT_X, 0)
        self.ui.write(e.EV_ABS, e.ABS_TILT_Y, 0)
        self.ui.write(e.EV_ABS, e.ABS_MISC, TOOL_ID)
        self.ui.write(e.EV_MSC, e.MSC_SERIAL, TOOL_SERIAL)
        self.ui.write(e.EV_KEY, e.BTN_TOOL_PEN, 1)
        self.sync()
        self.in_proximity = True

    def move(self, x, y, pressure):
        value = self._abs(pressure, PRESSURE_MAX)
        self.ui.write(e.EV_ABS, e.ABS_X, self._abs(x, X_MAX))
        self.ui.write(e.EV_ABS, e.ABS_Y, self._abs(y, Y_MAX))
        self.ui.write(e.EV_ABS, e.ABS_PRESSURE, value)
        # Distance and pressure are mutually exclusive on a real tablet: the
        # pen either hovers at a distance or rests with a pressure.
        self.ui.write(e.EV_ABS, e.ABS_DISTANCE, 0 if value else 20)
        # BTN_TOUCH is the tip switch, and it is what GtkGestureStylus turns
        # into `down`/`up` -- so a zero-pressure frame is a hover, and the
        # first non-zero one is the press.
        self.ui.write(e.EV_KEY, e.BTN_TOUCH, 1 if value else 0)
        self.ui.write(e.EV_MSC, e.MSC_SERIAL, TOOL_SERIAL)
        self.sync()

    def ramp(self, x0, y0, x1, y1, p0, p1, steps):
        for i in range(steps + 1):
            t = i / steps
            self.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, p0 + (p1 - p0) * t)

    def prox_out(self):
        self.ui.write(e.EV_ABS, e.ABS_PRESSURE, 0)
        self.ui.write(e.EV_KEY, e.BTN_TOUCH, 0)
        self.sync()
        self.ui.write(e.EV_ABS, e.ABS_DISTANCE, 0)
        self.ui.write(e.EV_ABS, e.ABS_MISC, 0)
        self.ui.write(e.EV_MSC, e.MSC_SERIAL, TOOL_SERIAL)
        self.ui.write(e.EV_KEY, e.BTN_TOOL_PEN, 0)
        self.sync()
        self.in_proximity = False


def main():
    pen = Stylus()
    # udev has to see the device and the compositor's libinput context has to
    # add it to the seat before anything injected through it means anything.
    # The caller waits again on top of this and burns a throwaway proximity
    # cycle before it measures anything -- see ./virtual-stylus.ts, which
    # explains why one settle is not enough for a tablet.
    time.sleep(1.5)
    print("ready", flush=True)
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] == "quit":
            break
        command, args = parts[0], [float(a) for a in parts[1:]]
        try:
            if command == "prox_in":
                pen.prox_in(args[0], args[1])
            elif command == "move":
                pen.move(args[0], args[1], args[2])
            elif command == "ramp":
                pen.ramp(*args[:6], int(args[6]))
            elif command == "prox_out":
                pen.prox_out()
            else:
                print(f"error unknown command {command}", flush=True)
                continue
        except Exception as error:  # noqa: BLE001 - reported, not swallowed
            print(f"error {error}", flush=True)
            continue
        print("ok", flush=True)
    # A pen left in proximity outlives this process in the compositor's idea of
    # the seat, so the exit path puts it down whatever happened above.
    if pen.in_proximity:
        pen.prox_out()
    pen.ui.close()


if __name__ == "__main__":
    main()
