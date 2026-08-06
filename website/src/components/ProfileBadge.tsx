import clsx from "clsx"
import type { ReactNode } from "react"
import styles from "./ProfileBadge.module.css"

export type Profile = "gtk" | "adw"

export type ProfileBadgeProps = {
  profile: Profile
}

// Compact GTK/Adw label. Deliberately dumb — it renders whatever `profile`
// it is given; the code-derived value (scripts/adw-profile/derive.ts) and
// docs:check enforcement (scripts/adw-profile/enforce.ts) live in the
// derivation, not here. Rendered above the page by the swizzled
// DocItem/Content wrapper (website/src/theme/DocItem/Content/index.tsx)
// for a subpath page's `profile:` frontmatter — see docs-site epic task
// 005.
const LABEL: Record<Profile, string> = {
  gtk: "GTK",
  adw: "Adw",
}

export default function ProfileBadge({
  profile,
}: ProfileBadgeProps): ReactNode {
  return (
    <span className={clsx(styles.badge, styles[profile])}>
      {LABEL[profile]}
    </span>
  )
}
