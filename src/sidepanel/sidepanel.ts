// Side panel entry point. Shows which Dynamics environment the active tab is
// on and whether the user has enabled tracing for it. The timeline UI arrives
// in Milestone 5.
import { detectDynamics, type DynamicsEnvironment } from '../dataverse/detect';
import { getAllowedHosts, onAllowedHostsChanged, setHostAllowed } from '../settings/allowedHosts';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const versionEl = byId('version');
const envNameEl = byId('env-name');
const envDetailEl = byId('env-detail');
const allowEl = byId('env-allow');
const allowTextEl = byId('env-allow-text');
const allowButton = byId<HTMLButtonElement>('env-allow-button');

versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

let current: DynamicsEnvironment | null = null;
let allowedHosts: string[] = [];

function render(): void {
  if (!current) {
    envNameEl.textContent = 'Not a Dynamics 365 page';
    envDetailEl.textContent = 'Open a Dynamics 365 or model-driven app page in this tab.';
    allowEl.hidden = true;
    return;
  }

  envNameEl.textContent = current.host;
  envDetailEl.textContent = `Organization: ${current.org} · ${current.isAppPage ? 'Model-driven app page' : 'Other Dynamics page'}`;

  const allowed = allowedHosts.includes(current.host);
  allowEl.hidden = false;
  allowEl.classList.toggle('allowed', allowed);
  allowTextEl.textContent = allowed
    ? 'Tracing is enabled for this environment.'
    : 'Tracing is off for this environment. Enable it to allow recording here.';
  allowButton.textContent = allowed ? 'Disable for this environment' : 'Enable for this environment';
}

async function refreshActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  current = detectDynamics(tab?.url);
  render();
}

allowButton.addEventListener('click', () => {
  if (!current) return;
  const enable = !allowedHosts.includes(current.host);
  setHostAllowed(current.host, enable)
    .then((hosts) => {
      allowedHosts = hosts;
      render();
    })
    .catch((error: unknown) => console.error('[D365 Trace Viewer] Could not save setting', error));
});

onAllowedHostsChanged((hosts) => {
  allowedHosts = hosts;
  render();
});

chrome.tabs.onActivated.addListener(() => {
  refreshActiveTab().catch(console.error);
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url !== undefined) refreshActiveTab().catch(console.error);
});

Promise.all([getAllowedHosts(), refreshActiveTab()])
  .then(([hosts]) => {
    allowedHosts = hosts;
    render();
  })
  .catch((error: unknown) => {
    console.error('[D365 Trace Viewer] Start-up failed', error);
    envNameEl.textContent = 'Not available';
  });
