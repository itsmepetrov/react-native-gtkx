import Link from "@docusaurus/Link"
import Heading from "@theme/Heading"
import type { ReactNode } from "react"
import styles from "./styles.module.css"

type FeatureItem = {
  title: string
  description: ReactNode
}

// Text kept close to the README pitch — factual sentences, not new
// marketing copy.
const FeatureList: FeatureItem[] = [
  {
    title: "Native, not a WebView",
    description: (
      <p>
        Apps render as real GTK4/Adwaita widgets through an in-process FFI — no
        WebView, no canvas rendering. What you see in the window is what{" "}
        <code>gtkx</code> actually built from your React tree.
      </p>
    ),
  },
  {
    title: "One codebase, two renderers",
    description: (
      <p>
        The same component tree runs as native GTK4 widgets and, unmodified, as
        react-native-web in the browser — <code>examples/profile</code> renders
        one source file with both renderers, without a single{" "}
        <code>@gtkx/*</code> import in it.
      </p>
    ),
  },
  {
    title: "The standard RN toolchain",
    description: (
      <>
        <p>
          Linux is a React Native out-of-tree platform, not a new API to learn.
          Add it to an app that already ships iOS/Android, then run:
        </p>
        <pre className={styles.codeCard}>
          <code>npx react-native run-linux</code>
        </pre>
      </>
    ),
  },
]

function Feature({ title, description }: FeatureItem) {
  return (
    <div className="col col--4">
      <div className={styles.feature}>
        <Heading as="h3">{title}</Heading>
        {description}
      </div>
    </div>
  )
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature
              key={idx}
              {...props}
            />
          ))}
        </div>
        <div className={styles.callout}>
          <Heading as="h3">Works without libadwaita</Heading>
          <p>
            react-native-gtkx also runs on plain GTK4, no libadwaita required —
            a real, supported profile, not an unsupported edge case. Every
            component&apos;s GTK/Adw badge is derived straight from the code and
            checked by <code>docs:check</code> on every PR, so the matrix
            can&apos;t drift from what&apos;s actually shipped. See the{" "}
            <Link to="/docs/guide/plain-gtk">plain GTK profile</Link>.
          </p>
        </div>
      </div>
    </section>
  )
}
