import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // Generated output, installed dependencies and local service data are never source code.
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      ".local/**",
      "server/src/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Underscore-prefixed parameters are deliberate placeholders, not oversights. Express in
    // particular identifies error middleware by arity, so its unused `next` argument has to stay.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Tooling, tests and the API run in Node rather than in the browser.
    files: [
      "*.{js,mjs,cjs}",
      "vite.config.ts",
      "scripts/**/*.{js,mjs,cjs,ts}",
      "server/**/*.ts",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // TypeScript owns JSX and component prop validation. eslint-plugin-react 7.x still calls an
      // API removed by ESLint 10; the Hooks plugin below is the React-specific correctness layer.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
