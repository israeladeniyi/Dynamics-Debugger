// Side panel entry point. Milestone 1 shows that the panel loads and can talk
// to the extension APIs; the timeline UI arrives in Milestone 5.

const versionEl = document.getElementById('version');
const tabHostEl = document.getElementById('tab-host');

if (versionEl) {
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
}

async function showActiveTabHost(): Promise<void> {
  if (!tabHostEl) return;
  // Without the "tabs" permission or host access, tab.url is undefined. Host
  // access for configured Dynamics environments is added in Milestone 2.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabHostEl.textContent = tab?.url ? new URL(tab.url).host : 'Not available yet (no host access granted)';
}

showActiveTabHost().catch((error: unknown) => {
  console.error('[D365 Trace Viewer] Could not read active tab', error);
  if (tabHostEl) tabHostEl.textContent = 'Not available';
});
