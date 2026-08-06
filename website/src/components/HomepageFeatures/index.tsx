import Link from "@docusaurus/Link"
import Heading from "@theme/Heading"
import clsx from "clsx"
import type { ReactNode } from "react"
import monitorShot from "../../../../docs/shots/monitor.png"
import profileWebShot from "../../../../docs/shots/profile-web.png"
import profileShot from "../../../../docs/shots/profile.png"
import tasksAppShot from "../../../../docs/shots/tasks-app.png"
import styles from "./styles.module.css"

type FeatureRow = {
  title: string
  description: ReactNode
  visual: ReactNode
  reverse: boolean
}

// Text kept close to the README pitch — factual sentences, not new
// marketing copy. Screenshots are real gallery/example shots, not mocks.
const FeatureList: FeatureRow[] = [
  {
    title: "Native, not a WebView",
    reverse: false,
    description: (
      <p>
        Apps render as real GTK4/Adwaita widgets through an in-process FFI — no
        WebView, no canvas rendering. What you see in the window is what{" "}
        <code>gtkx</code> actually built from your React tree.
      </p>
    ),
    visual: (
      <img
        className="shot-frame"
        src={tasksAppShot}
        alt="Tasks, a react-native-gtkx app, showing a sidebar of task lists next to the selected list's items"
      />
    ),
  },
  {
    title: "One codebase, two renderers",
    reverse: true,
    description: (
      <p>
        <code>examples/profile</code> renders ONE source file with both
        renderers — not a single <code>@gtkx/*</code> import in it. The same
        component tree runs as native GTK4 widgets and, unmodified, as
        react-native-web in the browser.
      </p>
    ),
    visual: (
      <div className="shot-pair">
        <img
          className="shot-frame"
          src={profileShot}
          alt="The profile example rendered by react-native-gtkx as native GTK4 widgets"
        />
        <img
          className="shot-frame"
          src={profileWebShot}
          alt="The same profile example rendered by react-native-web in a browser"
        />
      </div>
    ),
  },
  {
    title: "The standard RN toolchain",
    reverse: false,
    description: (
      <>
        <p>
          Linux is a React Native out-of-tree platform, not a new API to learn.
          Add it to an app that already ships iOS/Android with a one-line Metro
          config change, then run:
        </p>
        <pre className={styles.codeCard}>
          <code>npx react-native run-linux</code>
        </pre>
      </>
    ),
    visual: (
      <img
        className="shot-frame"
        src={monitorShot}
        alt="A system monitor app built with react-native-gtkx, reading CPU and memory straight from Node's os module in a native GTK4 window"
      />
    ),
  },
]

function Feature({ title, description, visual, reverse }: FeatureRow) {
  return (
    <div className={clsx(styles.featureRow, reverse && styles.reverse)}>
      <div className={styles.featureText}>
        <Heading as="h2">{title}</Heading>
        {description}
      </div>
      <div className={styles.featureVisual}>{visual}</div>
    </div>
  )
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        {FeatureList.map((props, idx) => (
          <Feature
            key={idx}
            {...props}
          />
        ))}
        <div className={styles.callout}>
          <Heading as="h2">Works without libadwaita</Heading>
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
