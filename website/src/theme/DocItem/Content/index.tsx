// Wraps (does not eject) the classic theme's DocItem/Content: renders
// ProfileBadge above the page when the doc's frontmatter carries
// `profile: gtk | adw` — the whole-page GTK/Adw designation for a subpath
// module (navigation.md, svg.md, dnd.md, gesture-handler.md,
// reanimated-compat.md; see docs-site epic task 005). Per-entry pages
// (docs/reference/components/*.md, apis.md's `##` sections) declare their
// profile as plain `**Profile:** ...` prose instead — no JSX in the .md
// source there — so this wrapper has nothing to do on those pages
// (frontMatter.profile is simply absent).
//
// One source of truth either way: this reads the SAME frontmatter
// scripts/adw-profile/declarations.ts's `parsePageProfile` checks against
// the derived matrix in docs:check, never a separate declaration.
import { useDoc } from "@docusaurus/plugin-content-docs/client"
import type { WrapperProps } from "@docusaurus/types"
import Content from "@theme-original/DocItem/Content"
import type ContentType from "@theme/DocItem/Content"
import type { ReactNode } from "react"
import ProfileBadge, { type Profile } from "@site/src/components/ProfileBadge"

type Props = WrapperProps<typeof ContentType>

const isProfile = (value: unknown): value is Profile =>
  value === "gtk" || value === "adw"

export default function ContentWrapper(props: Props): ReactNode {
  const { frontMatter } = useDoc()
  const profile = (frontMatter as Record<string, unknown>).profile

  return (
    <>
      {isProfile(profile) && (
        <div style={{ marginBottom: "1rem" }}>
          <ProfileBadge profile={profile} />
        </div>
      )}
      <Content {...props} />
    </>
  )
}
