import Link from "@docusaurus/Link"
import useBaseUrl from "@docusaurus/useBaseUrl"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import Heading from "@theme/Heading"
import Layout from "@theme/Layout"
import clsx from "clsx"
import type { ReactNode } from "react"
import HomepageFeatures from "@site/src/components/HomepageFeatures"
import hnList from "../../../docs/shots/hn-list.png"
import hnStory from "../../../docs/shots/hn-story.png"
import styles from "./index.module.css"

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext()
  const iconSrc = useBaseUrl("/img/icon.svg")
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <img
            className={styles.heroIcon}
            src={iconSrc}
            width={112}
            height={112}
            alt="react-native-gtkx"
          />
          <Heading
            as="h1"
            className="hero__title"
          >
            {siteConfig.title}
          </Heading>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link
              className="button button--primary button--lg"
              to="/docs/guide/installation"
            >
              Get Started
            </Link>
            <Link
              className="button button--secondary button--lg"
              to="/docs/reference/components"
            >
              Components
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

function HomepageHeroVisual() {
  return (
    <section className={styles.heroVisual}>
      <div className={clsx("container", styles.heroVisualContainer)}>
        <div className="shot-pair">
          <img
            className="shot-frame"
            src={hnList}
            alt="Hacker News list screen, react-native-gtkx, a native GTK4 window with a search field inside the header bar"
          />
          <img
            className="shot-frame"
            src={hnStory}
            alt="Hacker News story screen with comments, pushed with a real Adw.NavigationView transition"
          />
        </div>
        <p className={styles.heroVisualCaption}>
          <code>examples/hn-app</code>, live in native GTK windows. Tapping a
          card pushes a real <code>Adw.NavigationView</code> page — the back
          button, the slide and the preserved list position come from the
          platform, not from JS.
        </p>
      </div>
    </section>
  )
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext()
  return (
    <Layout
      title={siteConfig.title}
      description={siteConfig.tagline}
    >
      <HomepageHeader />
      <HomepageHeroVisual />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  )
}
