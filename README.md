# D365 Trace Viewer

A Microsoft Edge extension that observes a Dynamics 365 model-driven app session and turns noisy browser and Dataverse activity into a simple chronological story of what happened, how long it took, and where it failed.

Target: Microsoft Edge desktop, Manifest V3, Edge Side Panel UI, TypeScript.

## Status

- Milestone 1 (extension shell): loads unpacked in Edge, toolbar button opens a side panel.
- Milestone 2 (Dynamics detection): the side panel is only available on Dynamics 365 tabs (`https://<org>.crm*.dynamics.com`). It shows the detected environment, and you enable tracing per environment with **Enable for this environment**. Nothing is recorded yet.

Capture and the timeline come in later milestones. See [ROADMAP.md](ROADMAP.md) for the milestone list and planned features.

## Build

Requires Node.js 18 or newer.

```bash
npm install
npm run build      # outputs the extension to dist/
npm run watch      # rebuilds TypeScript on change
npm run typecheck
npm test           # unit tests (vitest)
npm run check      # typecheck + tests + build
```

## Load in Microsoft Edge

1. Run `npm run build`.
2. Open `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `dist` folder.
5. Open your Dynamics 365 app, then click the **D365 Trace Viewer** toolbar button (pin it from the Extensions menu if hidden). The side panel opens. On other sites the button does nothing.

After rebuilding, click **Reload** on the extension card in `edge://extensions`.

## Project structure

```
public/
  manifest.json            Manifest V3 definition
  icons/                   Toolbar icons (regenerate with scripts/make-icons.py)
src/
  background/
    service-worker.ts      Toolbar button opens the panel; panel enabled only on Dynamics tabs
  dataverse/
    detect.ts              Recognises Dynamics 365 hosts and app pages from a URL
  settings/
    allowedHosts.ts        Environments the user has enabled for tracing (chrome.storage.sync)
  models/
    TraceEvent.ts          Normalized event shape used by every layer
  sidepanel/
    sidepanel.html/.ts/.css
test/                      Unit tests (vitest)
scripts/
  build.mjs                esbuild bundle + static copy into dist/
```
