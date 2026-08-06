import type * as Preset from "@docusaurus/preset-classic"
import type { Config } from "@docusaurus/types"
import { themes as prismThemes } from "prism-react-renderer"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "react-native-gtkx",
  tagline: "React Native for the Linux desktop.",
  favicon: "img/icon.svg",

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  url: "https://itsmepetrov.github.io",
  baseUrl: "/react-native-gtkx/",

  // GitHub pages deployment config.
  organizationName: "itsmepetrov",
  projectName: "react-native-gtkx",

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  trailingSlash: false,

  // The repo's docs/ tree is hand-written GitHub-flavored markdown, not MDX —
  // it uses "<name>" placeholders and JSX-like prose ("<Svg>/<Path>") that
  // MDX would try to parse as elements/expressions. "detect" resolves the
  // parser per file by extension: .md files compile as plain CommonMark
  // (JSX/expressions disabled, raw HTML still allowed), .mdx files (none
  // today) would get full MDX. This lets docs/*.md build unmodified.
  markdown: {
    format: "detect",
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          // The docs plugin reads the repo's existing docs/ tree directly —
          // it stays the canonical, GitHub-browsable location; nothing moves.
          path: "../docs",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/itsmepetrov/react-native-gtkx/edit/main/docs/",
          exclude: [
            // Repo-only working notes — never published (PRD "Out of Scope").
            "research/**",
            "gtkx-rc4-notes.md",
            "upstream-gtkx.md",
            // Unfiled draft proposals for gtkx itself — not this platform's
            // documentation, and not ready for an audience (found leaking
            // into the sitemap/search index while hardening the site for
            // launch, task 008).
            "upstream/**",
            // Screenshots referenced by the repo README, not doc pages;
            // static image wiring for published pages lands in task 006.
            "shots/**",
          ],
        } satisfies Preset.Options["docs"],
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/social-preview.png",
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "react-native-gtkx",
      logo: {
        alt: "react-native-gtkx logo",
        src: "img/icon.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://github.com/itsmepetrov/react-native-gtkx",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Guide", to: "/docs/guide/installation" },
            { label: "Reference", to: "/docs/reference" },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/itsmepetrov/react-native-gtkx",
            },
            {
              label: "npm",
              href: "https://www.npmjs.com/package/react-native-gtkx",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Anton Petrov. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,

  themes: [
    [
      "@easyops-cn/docusaurus-search-local",
      {
        hashed: true,
        language: ["en"],
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: "/docs",
      },
    ],
  ],
}

export default config
