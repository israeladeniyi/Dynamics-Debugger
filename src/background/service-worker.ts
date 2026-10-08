// Background service worker. Makes the toolbar button open the side panel and
// keeps the panel available only on Dynamics 365 tabs. Capture logic arrives
// in Milestone 3.
import { detectDynamics } from '../dataverse/detect';

const PANEL_PATH = 'sidepanel/sidepanel.html';
const NOT_DYNAMICS_TITLE = 'D365 Trace Viewer: open a Dynamics 365 page to use it';
const DYNAMICS_TITLE = 'Open D365 Trace Viewer';

function logError(context: string) {
  return (error: unknown) => console.error(`[D365 Trace Viewer] ${context}`, error);
}

// Set on every worker start-up (not only onInstalled) so the behaviour holds
// after browser restarts and extension reloads.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(logError('setPanelBehavior failed'));

// Off by default; enabled per tab below.
chrome.sidePanel.setOptions({ enabled: false }).catch(logError('setOptions failed'));

async function updateTab(tabId: number, url: string | undefined): Promise<void> {
  // Without the "tabs" permission, url is only visible for hosts we have host
  // permission for, so any other site reads as undefined (not Dynamics).
  const isDynamics = detectDynamics(url) !== null;
  await chrome.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: isDynamics });
  await chrome.action.setTitle({ tabId, title: isDynamics ? DYNAMICS_TITLE : NOT_DYNAMICS_TITLE });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined || changeInfo.status === 'loading') {
    updateTab(tabId, tab.url).catch(logError('updateTab failed'));
  }
});

// Tabs that were already open when the worker started.
chrome.tabs
  .query({})
  .then((tabs) => Promise.all(tabs.map((t) => (t.id === undefined ? null : updateTab(t.id, t.url)))))
  .catch(logError('initial tab scan failed'));
