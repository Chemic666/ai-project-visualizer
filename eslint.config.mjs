import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    files: ["packages/core/**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ["packages/storage/**/*.mjs"],
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
