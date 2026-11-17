# Callout Studio for Quartz

A [Quartz](https://quartz.jzhao.xyz) plugin that draws the heading callouts and inline callouts of the [Callout Studio](https://github.com/Niv20/obsidian-plugin-callout-studio) Obsidian plugin while your site is built.

Without it, a heading callout such as `## [!tip] Title` or an inline callout such as `[!warning]` shows on your site as the text you typed. Quartz draws block callouts itself, and this plugin's stylesheet gives them the colors and icons you set up in Callout Studio.

The callouts are drawn into the page while it is built, so readers without JavaScript, your site's search and its RSS feed all get them. Nothing runs in the reader's browser.

## What you need

- The Callout Studio plugin, in the Obsidian vault your site is built from. The steps below assume your site's `content` folder is that vault.
- Quartz 5, or Quartz 4.

## Set it up

1. In Obsidian, run **Callout Studio: Publish to the web** from the command palette, choose **Quartz**, and select **Create file**. Callout Studio writes `.callout-studio/quartz.json` in your vault, with your callouts in it.
2. Install this plugin in your site, as below.
3. Build and deploy your site as usual.

### Quartz 5

In a terminal, in your site's folder, run:

```bash
npx quartz plugin add github:Niv20/quartz-plugin-callout-studio
```

This adds the plugin to `quartz.config.yaml` and `quartz.lock.json`. Commit and push both files, so your site's own build installs the plugin too.

### Quartz 4

In a terminal, in your site's folder, run:

```bash
npm install github:Niv20/quartz-plugin-callout-studio
```

Then, in `quartz.config.ts`, add this line after the other `import` lines:

```ts
import { CalloutStudio } from "quartz-plugin-callout-studio"
```

and add `CalloutStudio(),` to the `transformers` list, on the line just before `Plugin.Description()`:

```ts
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      CalloutStudio(),
      Plugin.Description(),
```

After `Plugin.Description()`, the callouts are still drawn, but search and RSS show `[!tip]`. The build log says so when it happens.

Commit and push `package.json`, `package-lock.json` and `quartz.config.ts`.

## After you change a callout

There is nothing to do. Callout Studio rewrites `.callout-studio/quartz.json` by itself, and your next build reads it.

## Updating the plugin

- Quartz 5: `npx quartz plugin install --latest quartz-plugin-callout-studio`, then commit `quartz.lock.json`.
- Quartz 4: `npm install github:Niv20/quartz-plugin-callout-studio` again, then commit `package-lock.json`.

## How it works

The plugin is the same for every site, and holds nobody's callouts. While your site is built, it reads `.callout-studio/quartz.json` from your content folder, checks it, and draws your callouts with what it carries.

Quartz doesn't publish files whose folder name starts with a period, so the file stays off your site without a line in `ignorePatterns`. Obsidian's file list doesn't show it either.

If something is wrong, the build log says so in a line that starts with `[Callout Studio]`, and the callouts stay as text. The build never fails because of this plugin. The usual causes:

- **The file was not found.** Create it in Obsidian (step 1), and check that it reaches the folder your site is built from.
- **The file was changed by hand.** In Obsidian, select **Update now** in the **Quartz** steps of **Publish to the web**.
- **The file was written by a newer Callout Studio.** Update this plugin, as above.

## Privacy

The plugin makes no network requests. It reads only `.callout-studio/quartz.json` in your content folder, and writes nothing.

## Source

This repository holds the built plugin. Its source is in the Callout Studio repository, under [`src/web/`](https://github.com/Niv20/obsidian-plugin-callout-studio/tree/master/src/web), and the full guide is [Publish to the web](https://github.com/Niv20/obsidian-plugin-callout-studio/blob/master/docs/user-guide/19-publish-to-the-web.md).

Released under the license in [LICENSE](LICENSE).
