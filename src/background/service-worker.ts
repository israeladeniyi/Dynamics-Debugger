// Background service worker. Makes the toolbar button open the side panel and
// labels the button per tab. The panel itself stays open across tab switches
// (Edge cannot reopen a panel without a user click); it tells the user when
// the active tab is not Dynamics 365. Capture logic arrives in Milestone 3.
import { detectDynamics } from '../dataverse/detect';

const NOT_DYNAMICS_TITLE = 'D365 Trace Viewer: not a Dynamics 365 page';
const DYNAMICS_TITLE = 'Open D365 Trace Viewer';

function logError(context: string) {
  return (error: unknown) => console.error(`[D365 Trace Viewer] ${context}`, error);
}

// Set on every worker start-up (not only onInstalled) so the behaviour holds
// after browser restarts and extension reloads.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(logError('setPanelBehavior failed'));

// Earlier builds turned the panel off by default; make sure it is on everywhere.
chrome.sidePanel
  .setOptions({ path: 'sidepanel/sidepanel.html', enabled: true })
  .catch(logError('setOptions failed'));

async function updateTab(tabId: number, url: string | undefined): Promise<void> {
  // Without the "tabs" permission, url is only visible for hosts we have host
  // permission for, so any other site reads as undefined (not Dynamics).
  const isDynamics = detectDynamics(url) !== null;
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
