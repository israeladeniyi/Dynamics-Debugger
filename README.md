# D365 Trace Viewer

A Microsoft Edge extension that observes a Dynamics 365 model-driven app session and turns noisy browser and Dataverse activity into a simple chronological story of what happened, how long it took, and where it failed.

Target: Microsoft Edge desktop, Manifest V3, Edge Side Panel UI, TypeScript.

## Status

Milestone 1 (extension shell) is in place: the extension loads unpacked in Edge, shows a toolbar button, and opens a side panel. Dynamics detection, capture and the timeline come in later milestones.

## Build

Requires Node.js 18 or newer.

```bash
npm install
npm run build      # outputs the extension to dist/
npm run watch      # rebuilds TypeScript on change
npm run typecheck
```

## Load in Microsoft Edge

1. Run `npm run build`.
2. Open `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `dist` folder.
5. Click the **D365 Trace Viewer** toolbar button (pin it from the Extensions menu if hidden). The side panel opens.

After rebuilding, click **Reload** on the extension card in `edge://extensions`.

## Project structure

```
public/
  manifest.json            Manifest V3 definition
  icons/                   Toolbar icons (regenerate with scripts/make-icons.py)
src/
  background/
    service-worker.ts      Opens the side panel from the toolbar button
  models/
    TraceEvent.ts          Normalized event shape used by every layer
  sidepanel/
    sidepanel.html/.ts/.css
scripts/
  build.mjs                esbuild bundle + static copy into dist/
```
