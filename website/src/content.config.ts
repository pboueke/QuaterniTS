import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// The Starlight documentation collection. Starlight loads pages from
// `src/content/docs/`. The `reference/` subtree is generated at build time from
// the repository's canonical `docs/` files (`toolkit/scripts/docs-build.ts`), so
// those pages must not be hand-edited here.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
