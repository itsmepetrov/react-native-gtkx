# Dev/CI environment for react-native-gtkx: GTK4 + libadwaita + Node 24 + headless X.
# gtkx requires GTK4 >= 4.20, libadwaita >= 1.8, Node >= 24 — ubuntu:26.04 ships GTK 4.22 / adwaita 1.9.
FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgtk-4-dev \
    libadwaita-1-dev \
    gobject-introspection \
    libgirepository1.0-dev \
    gir1.2-gtk-4.0 \
    gir1.2-adw-1 \
    xvfb \
    x11-apps \
    imagemagick \
    dbus \
    dbus-x11 \
    adwaita-icon-theme \
    fonts-cantarell \
    fonts-dejavu-core \
    build-essential \
    pkg-config \
    python3 \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# @gtkx/testing runs widgets under a headless Wayland compositor (sway).
# x11vnc exposes the Xvfb display for live viewing from the host (vnc://<host>:5901);
# openbox gives live windows decorations so they can be moved/resized over VNC.
RUN apt-get update && apt-get install -y --no-install-recommends sway xwayland x11vnc openbox \
    && rm -rf /var/lib/apt/lists/*

ENV GDK_BACKEND=x11
WORKDIR /work
CMD ["bash"]
