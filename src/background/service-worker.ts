// Background service worker. For Milestone 1 its only job is to make the
// toolbar button open the side panel. Capture logic arrives in Milestone 3.

// Set on every worker start-up (not only onInstalled) so the behaviour holds
// after browser restarts and extension reloads.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: unknown) => console.error('[D365 Trace Viewer] setPanelBehavior failed', error));
