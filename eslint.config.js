// Flat ESLint configuration. One authority for lint rules across the repo.
// Run through `make lint` (containerised) or `npm run lint`.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "coverage/**", ".toolkit/**", "dist/**"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
