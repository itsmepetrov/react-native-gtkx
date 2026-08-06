import Heading from "@theme/Heading"
import clsx from "clsx"
import type { ReactNode } from "react"
import styles from "./styles.module.css"

type FeatureItem = {
  title: string
  description: ReactNode
}

// Short, factual restatements of the README pitch — not new marketing copy.
const FeatureList: FeatureItem[] = [
  {
    title: "Native widgets, not a WebView",
    description: (
      <>
        Apps render as real GTK4/Adwaita widgets through an in-process FFI — no
        WebView, no canvas rendering.
      </>
    ),
  },
  {
    title: "The familiar React Native API",
    description: (
      <>
        Linux is an RN out-of-tree platform here:{" "}
        <code>npx react-native run-linux</code> next to <code>run-ios</code>/
        <code>run-android</code>.
      </>
    ),
  },
  {
    title: "Native navigation",
    description: (
      <>
        react-navigation screens are real <code>Adw.NavigationPage</code>s — the
        back button, gestures and transitions come from the platform.
      </>
    ),
  },
]

function Feature({ title, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
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
      </div>
    </section>
  )
}
