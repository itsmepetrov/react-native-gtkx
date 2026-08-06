import clsx from "clsx"
import type { ReactNode } from "react"
import styles from "./ProfileBadge.module.css"

export type Profile = "gtk" | "adw"

export type ProfileBadgeProps = {
  profile: Profile
}

// Compact GTK/Adw label. Deliberately dumb — it renders whatever `profile`
// it is given; the derivation from `docs/reference/**` frontmatter and the
// docs:check enforcement land in a later docs-site task.
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
