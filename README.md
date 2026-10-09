# D365 Trace Viewer

A Microsoft Edge extension that observes a Dynamics 365 model-driven app session and turns noisy browser and Dataverse activity into a simple chronological story of what happened, how long it took, and where it failed.

Target: Microsoft Edge desktop, Manifest V3, Edge Side Panel UI, TypeScript.

## Status

- Milestone 1 (extension shell): loads unpacked in Edge, toolbar button opens a side panel.
- Milestone 2 (Dynamics detection): the side panel is only available on Dynamics 365 tabs (`https://<org>.crm*.dynamics.com`). It shows the detected environment, and you enable tracing per environment with **Enable for this environment**. Nothing is recorded yet.

- Milestone 3 (capture proof of concept): **Start**, **Pause**, **Resume**, **Stop** and **Clear** in the side panel, a pulsing *Recording* indicator and a **REC** badge on the toolbar button. While recording, every request the recorded tab makes to its Dynamics host is listed with time, method, path, status and duration. Only enabled environments can be recorded. See *What is captured* below.
- Milestone 4 (Dataverse recognition): each Dataverse Web API request is labelled from its URL as **Create**, **Retrieve**, **Retrieve list**, **Update** or **Delete** on a table, or as a **Function**, **Action**, **Batch** or **Metadata** call. Known background calls the app makes on its own (client metadata, settings, Copilot and Customer Service features) are hidden by the default **Data activity** filter; **All Dataverse** and **All requests** show everything, with background rows greyed out. Hover a row for its full path and request ID. **Copy** puts the listed rows on the clipboard as tab-separated text (time, operation, target, status, ms, method, path, request ID), which pastes into Excel, a ticket or a chat. It holds only what the panel already stores.
- Milestone 5 (clean timeline): the list is a timeline in start order. Each event has a status colour (green OK, amber slow at 2 s or more, red failed, grey background), its duration with a bar scaled to the slowest listed event, and a "N s later" marker where 5 s or more passed between events. Click an event to open its Details: request, status, duration, start time, request ID, table and notes.

Friendly names, error messages and action stories come in later milestones. See [ROADMAP.md](ROADMAP.md) for the milestone list and planned features.

## What is captured

- Captured: start time, duration, HTTP method, path, HTTP status (or the browser's network error), the `x-ms-service-request-id` response header, and whether it came from cache.
- Never captured: query strings (Dynamics puts FetchXML and filter values there), request or response bodies, cookies, `Authorization` or any other header. Record GUIDs in the path are replaced by `{id}`.
- Only the tab you pressed **Start** on, and only its Dynamics host. Other tabs and sites are ignored.
- Stored in `chrome.storage.session`: in memory, kept if Edge pauses the extension's background script, and wiped when Edge closes. At most 5,000 requests per recording; the oldest are dropped after that.

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
    service-worker.ts      Panel only on Dynamics tabs; runs recording commands and capture
  capture/
    classify.ts            Sanitizes paths and sorts URLs (Dataverse API, $batch, page, resource)
    network.ts             Read-only chrome.webRequest capture for the recorded tab
  recording/
    store.ts, types.ts     Recording state and captured requests in chrome.storage.session
  dataverse/
    detect.ts              Recognises Dynamics 365 hosts and app pages from a URL
    parser.ts              Maps Web API method + path to Create/Retrieve/Update/Delete, function, action, $batch
    background.ts          Known background calls hidden by the default filter
  settings/
    allowedHosts.ts        Environments the user has enabled for tracing (chrome.storage.sync)
  models/
    TraceEvent.ts          Normalized event shape used by every layer
  sidepanel/
    sidepanel.html/.ts/.css
    rows.ts                Filtering, sorting, formatting and copy-as-text for the timeline
  timeline/
    normalizer.ts          Captured request -> TraceEvent with severity and Details
test/                      Unit tests (vitest)
scripts/
  build.mjs                esbuild bundle + static copy into dist/
```
