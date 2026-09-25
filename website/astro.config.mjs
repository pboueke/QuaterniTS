// Astro + Starlight configuration for the QuaterniTS documentation site.
//
// This project is a presentation layer for the headless rules library: a static,
// browsable site published to GitHub Pages at
// https://pboueke.github.io/QuaterniTS/. It is not a game UI and ships no game
// logic. The `base` value must match the repository name exactly (the repository
// is `QuaterniTS` with that capitalisation), because GitHub Pages serves the
// site from `https://<owner>.github.io/<repository>/`.
//
// Every page is a static file under `website/dist`; the build runs inside the
// digest-pinned toolkit (`make docs-build`) and never fetches assets at runtime.
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

/** The GitHub Pages origin and the repository sub-path the site is served from. */
export const site = "https://pboueke.github.io";
/** The repository sub-path, derived from the repository's real capitalisation. */
export const base = "/QuaterniTS/";
/** The canonical repository URL linked from every "edit this page" affordance. */
export const repositoryUrl = "https://github.com/pboueke/QuaterniTS";

export default defineConfig({
  site,
  base,
  // A single static build; no server output, adapter or runtime network access.
  output: "static",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "QuaterniTS",
      description:
        "Unofficial, community-driven headless TypeScript rules library for the four-player game Quaternity.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: repositoryUrl,
        },
      ],
      editLink: {
        baseUrl: `${repositoryUrl}/edit/main/`,
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Getting started",
          link: "/getting-started/",
        },
        {
          label: "API & compatibility",
          items: [
            { label: "Public API", link: "/api/" },
            { label: "Usage examples", link: "/reference/usage/" },
            { label: "Compatibility", link: "/reference/compatibility/" },
            { label: "Snapshots", link: "/snapshots/" },
          ],
        },
        {
          label: "Rules & fixtures",
          items: [
            { label: "Overview", link: "/rules/" },
            {
              label: "Rules",
              items: [
                { label: "Pawns", link: "/reference/rules/pawn-vectors/" },
                {
                  label: "Checkmate and assimilation",
                  link: "/reference/rules/multiplayer-adjudication/",
                },
                {
                  label: "Draws and other actions",
                  link: "/reference/rules/administrative-actions/",
                },
                {
                  label: "Unresolved positions",
                  link: "/reference/rules/d38-coordinate-search/",
                },
              ],
            },
            {
              label: "Examples",
              items: [
                {
                  label: "Starting position",
                  link: "/reference/fixtures/opening-position/",
                },
                {
                  label: "Example match",
                  link: "/reference/fixtures/opening-to-terminal-administrative-match/",
                },
              ],
            },
          ],
        },
        {
          label: "Project",
          items: [
            { label: "Contributing", link: "/contributing/" },
            { label: "Notation & scope", link: "/scope/" },
          ],
        },
      ],
    }),
  ],
});
