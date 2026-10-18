import eslintConfigPrettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const typeCheckedFiles = ["**/*.{ts,tsx,mts,cts}"];
const scriptFiles = ["**/*.{js,mjs,cjs}"];
const tsxFiles = ["**/*.tsx"];

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "**/.output",
      "**/.wxt",
      "**/coverage",
      "**/node_modules",
      "**/types.gen.ts",
    ],
  },
  {
    files: typeCheckedFiles,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: scriptFiles,
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: tsxFiles,
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: tsxFiles,
  },
  eslintConfigPrettier,
);
