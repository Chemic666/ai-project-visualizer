import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["experiments/core-preview/dist/**"] },
  {
    files: ["packages/core/**/*.ts", "experiments/core-preview/**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    files: [
      "packages/storage/**/*.mjs",
      "packages/vscode-surface/**/*.{cjs,mjs,js}",
      "packages/storage-host-validation/**/*.{mjs,cjs}",
      "experiments/core-preview/**/*.mjs",
      "experiments/core-walkthrough/**/*.mjs",
    ],
    rules: {
      "no-unused-vars": [
        "error",
        { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-unreachable": "error",
      "no-dupe-args": "error",
      "no-constant-condition": "error",
    },
  },
);
