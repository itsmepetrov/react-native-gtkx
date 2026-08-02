// One palette for both screens, so the window reads as one app rather than
// two library demos glued together. Adwaita's own accent blue and the
// light/dark neutrals from the GNOME HIG.
export const theme = {
  background: "#fafafb",
  surface: "#ffffff",
  surfaceAlt: "#f0f0f2",
  border: "#d8d8dd",
  text: "#1d1d20",
  textMuted: "#5e5c64",
  accent: "#3584e4",
  accentSoft: "#dceaf9",
  accentDeep: "#1c71d8",
  success: "#2ec27e",
  successSoft: "#ddf4e9",
  warning: "#e5a50a",
} as const
