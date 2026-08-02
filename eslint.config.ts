import eslint from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import eslintPluginPrettier from "eslint-plugin-prettier/recommended"
import eslintPluginReact from "eslint-plugin-react"
import eslintPluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import typescriptEslint from "typescript-eslint"

export default typescriptEslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out-tsc/**",
      "**/node_modules/**",
      "spike/shots/**",
    ],
  },
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [
      eslint.configs.recommended,
      ...typescriptEslint.configs.recommended,
      eslintPluginReact.configs.flat.recommended,
      eslintPluginReact.configs.flat["jsx-runtime"],
      eslintPluginReactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
      parserOptions: {
        parser: typescriptEslint.parser,
      },
    },
    settings: {
      react: {
        version: "19",
      },
    },
    rules: {
      "space-before-function-paren": 0,
      "arrow-parens": ["error", "always"],

      "comma-dangle": [
        "error",
        {
          arrays: "always-multiline",
          objects: "always-multiline",
          imports: "always-multiline",
          exports: "always-multiline",
          functions: "never",
        },
      ],

      "eol-last": "off",
      "function-paren-newline": ["off"],
      "global-require": "off",
      "implicit-arrow-linebreak": "off",

      indent: [
        "error",
        2,
        {
          SwitchCase: 1,
        },
      ],

      "max-len": [
        "error",
        {
          code: 120,
          comments: 120,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],

      "no-await-in-loop": "off",
      "no-confusing-arrow": "off",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-empty": "warn",
      "no-unused-vars": "off",
      "no-unreachable": "warn",
      "no-prototype-builtins": "off",
      "no-restricted-syntax": ["error", "LabeledStatement", "WithStatement"],
      "no-return-assign": "off",

      "no-unused-expressions": [
        "error",
        {
          allowTernary: true,
        },
      ],

      "no-use-before-define": "off",
      "no-lonely-if": "off",
      "object-curly-newline": "off",
      "operator-linebreak": "off",
      "prefer-promise-reject-errors": "off",
      "quote-props": ["error", "as-needed"],
      semi: ["error", "never"],

      // gtkx is an RC dependency: every @gtkx/* import goes through the bridge,
      // so upstream API drift is absorbed in one place (epic decision #4).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@gtkx/*"],
              message:
                "Import gtkx only via src/gtkx/bridge/ — see epic architecture decision #4.",
            },
          ],
        },
      ],

      "react/prop-types": "off",

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
    },
  },
  {
    files: [
      "packages/react-native-gtkx/src/gtkx/bridge/**",
      "packages/react-native-gtkx/src/runner/**",
      // The SEA bundler builds a single-executable artifact by reaching
      // into @gtkx/* directly (resolving/loading HOST_MODULE_EXTERNALS
      // and gtkx.config.ts at build time) — see src/sea/bundle.ts.
      "packages/react-native-gtkx/src/sea/**",
      // The testing preset subpaths: they wrap @gtkx/vitest and
      // @gtkx/testing directly on purpose, same reasoning as src/runner/.
      "packages/react-native-gtkx/src/vitest/**",
      "packages/react-native-gtkx/src/testing/**",
      "packages/react-native-gtkx/tests/gtk/**",
      "**/gtkx.config.ts",
      "vitest.config.ts",
      "spike/**",
      // Classifies the real @gtkx/gi widget prototype chain — the one place
      // outside the bridge itself allowed to see gtkx's actual exports.
      "scripts/generate-widget-surface.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["spike/**"],
    rules: {
      "no-console": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    // Scripts are CLI tools — printing to stdout/stderr is the whole point.
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Components lazily create engine nodes / text probes in refs during
    // render — the documented React lazy-init escape hatch, which the strict
    // react-hooks/refs rule cannot distinguish from unsafe access.
    files: ["packages/react-native-gtkx/src/components/**"],
    rules: {
      "react-hooks/refs": "off",
    },
  },
  {
    // The gallery's render counter exists to observe renders, which means
    // reading and writing a ref during render — the exact thing this rule
    // forbids, and the only way to put "React rendered this component N
    // times" on screen. Its PanResponder callbacks are also built inside a
    // useState initializer, where the rule cannot see that they are deferred.
    // Same escape hatch, same reasoning, as src/components and spike/ above.
    files: ["examples/gallery/**"],
    rules: {
      "react-hooks/refs": "off",
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  eslintPluginPrettier,
  eslintConfigPrettier,
  {
    rules: {
      curly: ["error", "all"],
    },
  },
)
