// Flat ESLint configuration. One authority for lint rules across the repo.
// Run through `make lint` (containerised) or `npm run lint`.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      ".toolkit/**",
      "dist/**",
      // The docs site's build output, Astro cache and generated copy of the
      // canonical docs pages are generated artifacts, never linted sources.
      "website/dist/**",
      "website/.astro/**",
      "website/src/content/docs/reference/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  // The consumer fixtures are samples of how a consumer loads the package, so
  // the CommonJS fixture calls `require` on purpose. Declare the CommonJS
  // vocabulary for exactly that directory instead of loosening a rule
  // repository-wide.
  {
    files: ["toolkit/consumers/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { require: "readonly", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
