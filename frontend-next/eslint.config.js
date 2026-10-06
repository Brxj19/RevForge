import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solid from "eslint-plugin-solid/configs/typescript";
import globals from "globals";

// Module boundaries (architecture.md §2). Patterns match both "~/" aliases and relative paths.
const NO_APP = {
  group: ["~/app", "~/app/**", "**/app/**"],
  message: "ui/ and lib/ must not depend on app/.",
};
const NO_FEATURES = {
  group: ["~/features/**", "**/features/**"],
  message: "Only app/ composes features.",
};
const NO_API = {
  group: ["~/lib/api", "~/lib/api/**", "**/lib/api/**"],
  message: "ui/ primitives never call the API.",
};
const NO_MOCKS = {
  group: ["~/mocks/**", "**/mocks/**"],
  message: "Mocks are for tests and dev:mock only.",
};

const innerHtmlBan = [
  "error",
  {
    selector: "JSXAttribute[name.name='innerHTML']",
    message:
      "innerHTML is only allowed in lib/markdown, ui/icons and ui/illustrations (F8, F9, I35).",
  },
  {
    selector:
      "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
    message:
      "innerHTML is only allowed in lib/markdown, ui/icons and ui/illustrations (F8, F9, I35).",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "insertAdjacentHTML is not allowed.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "playwright-report",
      "public/mockServiceWorker.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    ...solid,
    languageOptions: {
      ...solid.languageOptions,
      parser: tseslint.parser,
      globals: { ...globals.browser },
    },
    rules: {
      ...solid.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-syntax": innerHtmlBan,
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [NO_APP, NO_FEATURES, NO_API, NO_MOCKS] },
      ],
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [NO_APP, NO_FEATURES, NO_MOCKS] },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            NO_MOCKS,
            {
              group: [
                "~/app/**",
                "!~/app/auth",
                "**/app/shell/**",
                "**/app/routes*",
              ],
              message:
                "Features may only use the auth hook from app/ (architecture.md §2).",
            },
            {
              group: ["~/features/*/**", "../../features/**", "../*/**"],
              message:
                "Import another feature through its index.ts, never its internals.",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests assert on signal values outside tracking scopes and index into known fixtures.
    files: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/mocks/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "solid/reactivity": "off",
    },
  },
  {
    // Static, compile-time SVG data and sanitised Markdown are the only innerHTML sinks.
    files: [
      "src/lib/markdown/**",
      "src/ui/icons/**",
      "src/ui/illustrations/**",
    ],
    rules: { "no-restricted-syntax": "off", "solid/no-innerhtml": "off" },
  },
  {
    files: ["*.config.{js,ts}", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
);
