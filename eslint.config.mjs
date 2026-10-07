import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["packages/core/**/*.ts"],
  extends: [tseslint.configs.recommended],
});
