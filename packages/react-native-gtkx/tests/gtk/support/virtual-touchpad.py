#!/usr/bin/env python3
"""A virtual multitouch touchpad on /dev/uinput, driven over stdin.

The other half of ./virtual-touchpad.ts, which is the file to read first.
This half exists in Python because creating a uinput device needs ioctls
(UI_SET_EVBIT, UI_DEV_SETUP, ...) and Node has no ioctl; python3-evdev has
them, and it is the same technique libinput's own litest suite uses.

The device shape is an ordinary laptop clickpad: 100x60mm at 40 units/mm,
two MT slots, INPUT_PROP_POINTER. That is the whole of what libinput needs
to classify it as a touchpad (`cap:pg` — pointer and GESTURE) and start
running its pinch/swipe detection over it.

Protocol: one command per line on stdin, one `ok` per command on stdout once
the injected sequence has been written and flushed. `ready` is printed once,
after the device has been created and udev has had time to see it.

    pinch <scale> [steps]     two fingers, distance multiplied by <scale>
    rotate <degrees> [steps]  two fingers, rotated about their midpoint
    glide <dx_mm> <dy_mm>     one finger, which is how the pointer is moved
    quit
"""

import math
import sys
import time

from evdev import AbsInfo, UInput
from evdev import ecodes as e

# 100mm x 60mm at 40 units/mm. The resolution matters: libinput reports a
# touchpad without one as having no dimensions and falls back to a default,
# and its gesture thresholds are all in millimetres.
RESOLUTION = 40
X_MAX = 100 * RESOLUTION
Y_MAX = 60 * RESOLUTION

# BTN_TOOL_DOUBLETAP is what tells the kernel and libinput that two fingers
# are down; without it a two-slot report is not a two-finger gesture.
CAPABILITIES = {
    e.EV_KEY: [
        e.BTN_LEFT,
        # BTN_RIGHT is not decoration: without it libinput logs "kernel bug:
        # missing right button, assuming it is a clickpad" and reclassifies
        # the device. A touchpad with physical buttons is the simpler shape.
        e.BTN_RIGHT,
        e.BTN_TOUCH,
        e.BTN_TOOL_FINGER,
        e.BTN_TOOL_DOUBLETAP,
        e.BTN_TOOL_TRIPLETAP,
        e.BTN_TOOL_QUADTAP,
    ],
    e.EV_ABS: [
        (e.ABS_X, AbsInfo(0, 0, X_MAX, 0, 0, RESOLUTION)),
        (e.ABS_Y, AbsInfo(0, 0, Y_MAX, 0, 0, RESOLUTION)),
        (e.ABS_PRESSURE, AbsInfo(0, 0, 255, 0, 0, 0)),
        (e.ABS_MT_SLOT, AbsInfo(0, 0, 1, 0, 0, 0)),
        (e.ABS_MT_POSITION_X, AbsInfo(0, 0, X_MAX, 0, 0, RESOLUTION)),
        (e.ABS_MT_POSITION_Y, AbsInfo(0, 0, Y_MAX, 0, 0, RESOLUTION)),
        (e.ABS_MT_TRACKING_ID, AbsInfo(0, 0, 65535, 0, 0, 0)),
        (e.ABS_MT_PRESSURE, AbsInfo(0, 0, 255, 0, 0, 0)),
    ],
}

CENTRE = (X_MAX // 2, Y_MAX // 2)
# Frames arrive at roughly this interval on a real touchpad, and the interval
# is not decoration: libinput decides pinch-versus-scroll from the first few
# frames of motion and computes its velocities from the timestamps.
FRAME_MS = 12
PRESSURE = 60
# 15mm from the midpoint — 30mm apart, which is a comfortable two-finger
# starting span and leaves room to spread without running off the edge.
START_RADIUS = 15 * RESOLUTION


class Touchpad:
    def __init__(self):
        self.ui = UInput(
            CAPABILITIES,
            name="rn-gtkx virtual touchpad",
            vendor=0x0002,
            product=0x0007,
            version=0x01B1,
            phys="rn-gtkx/serio0/input0",
            input_props=[e.INPUT_PROP_POINTER],
        )
        self.tracking = 1

    def sync(self):
        self.ui.syn()
        time.sleep(FRAME_MS / 1000)

    def place(self, index, x, y):
        self.ui.write(e.EV_ABS, e.ABS_MT_SLOT, index)
        self.ui.write(e.EV_ABS, e.ABS_MT_POSITION_X, int(x))
        self.ui.write(e.EV_ABS, e.ABS_MT_POSITION_Y, int(y))
        self.ui.write(e.EV_ABS, e.ABS_MT_PRESSURE, PRESSURE)

    def down(self, points):
        """Puts every finger down in one frame."""
        for index, (x, y) in enumerate(points):
            self.ui.write(e.EV_ABS, e.ABS_MT_SLOT, index)
            self.ui.write(e.EV_ABS, e.ABS_MT_TRACKING_ID, self.tracking)
            self.tracking += 1
            self.place(index, x, y)
        self.ui.write(e.EV_KEY, e.BTN_TOUCH, 1)
        self.ui.write(e.EV_KEY, e.BTN_TOOL_FINGER, 1 if len(points) == 1 else 0)
        self.ui.write(e.EV_KEY, e.BTN_TOOL_DOUBLETAP, 1 if len(points) == 2 else 0)
        # Single-touch emulation follows the first finger. libinput reads the
        # MT slots, but a device that reports slots and no ABS_X/ABS_Y at all
        # is not a shape any driver produces.
        self.ui.write(e.EV_ABS, e.ABS_X, int(points[0][0]))
        self.ui.write(e.EV_ABS, e.ABS_Y, int(points[0][1]))
        self.ui.write(e.EV_ABS, e.ABS_PRESSURE, PRESSURE)
        self.sync()

    def move(self, points):
        for index, (x, y) in enumerate(points):
            self.place(index, x, y)
        self.ui.write(e.EV_ABS, e.ABS_X, int(points[0][0]))
        self.ui.write(e.EV_ABS, e.ABS_Y, int(points[0][1]))
        self.sync()

    def up(self, count):
        for index in range(count):
            self.ui.write(e.EV_ABS, e.ABS_MT_SLOT, index)
            self.ui.write(e.EV_ABS, e.ABS_MT_TRACKING_ID, -1)
        self.ui.write(e.EV_KEY, e.BTN_TOUCH, 0)
        self.ui.write(e.EV_KEY, e.BTN_TOOL_FINGER, 0)
        self.ui.write(e.EV_KEY, e.BTN_TOOL_DOUBLETAP, 0)
        self.ui.write(e.EV_ABS, e.ABS_PRESSURE, 0)
        self.sync()

    def two_finger(self, radii, angles):
        """Two fingers through a (radius, angle) path about the midpoint."""
        cx, cy = CENTRE

        def points(radius, angle):
            dx = radius * math.cos(angle)
            dy = radius * math.sin(angle)
            return [(cx - dx, cy - dy), (cx + dx, cy + dy)]

        self.down(points(radii[0], angles[0]))
        # No dwell before the motion: a real pinch starts moving at once, and
        # a pair of fingers that sits still for 150ms is what libinput's own
        # scroll timeout is waiting for.
        for radius, angle in zip(radii[1:], angles[1:]):
            self.move(points(radius, angle))
        self.up(2)

    def pinch(self, scale, steps):
        end = START_RADIUS * scale
        radii = [
            START_RADIUS + (end - START_RADIUS) * i / steps for i in range(steps + 1)
        ]
        self.two_finger(radii, [0.0] * (steps + 1))

    def rotate(self, degrees, steps):
        total = math.radians(degrees)
        angles = [total * i / steps for i in range(steps + 1)]
        self.two_finger([START_RADIUS] * (steps + 1), angles)

    def glide(self, dx_mm, dy_mm):
        cx, cy = CENTRE
        target_x = cx + dx_mm * RESOLUTION
        target_y = cy + dy_mm * RESOLUTION
        # One step per 3mm, floor 10. libinput discards a frame that moves a
        # finger further than its jump threshold ("Touch jump detected and
        # discarded"), so a long glide in ten steps silently loses travel.
        steps = max(10, math.ceil(math.hypot(dx_mm, dy_mm) / 3))
        self.down([(cx, cy)])
        for i in range(1, steps + 1):
            self.move(
                [
                    (
                        cx + (target_x - cx) * i / steps,
                        cy + (target_y - cy) * i / steps,
                    )
                ]
            )
        self.up(1)


def main():
    pad = Touchpad()
    # udev has to see the device and the compositor's libinput context has to
    # add it to the seat before anything injected through it means anything.
    time.sleep(1.5)
    print("ready", flush=True)
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] == "quit":
            break
        command = parts[0]
        try:
            if command == "pinch":
                pad.pinch(float(parts[1]), int(parts[2]) if len(parts) > 2 else 20)
            elif command == "rotate":
                pad.rotate(float(parts[1]), int(parts[2]) if len(parts) > 2 else 20)
            elif command == "glide":
                pad.glide(float(parts[1]), float(parts[2]))
            else:
                print(f"error unknown command {command}", flush=True)
                continue
        except Exception as error:  # noqa: BLE001 - reported, not swallowed
            print(f"error {error}", flush=True)
            continue
        print("ok", flush=True)
    pad.ui.close()


if __name__ == "__main__":
    main()
