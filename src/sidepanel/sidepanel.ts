// Side panel entry point. Shows which Dynamics environment the active tab is
// on, whether tracing is enabled for it, the recording controls, and the raw
// list of captured requests with the Dataverse operation recognised from each
// URL. The friendly timeline arrives in Milestone 5.
import { detectDynamics, type DynamicsEnvironment } from '../dataverse/detect';
import { operationLabel, parseDataverseRequest, targetLabel, type DataverseRequest } from '../dataverse/parser';
import { getAllowedHosts, onAllowedHostsChanged, setHostAllowed } from '../settings/allowedHosts';
import { getEvents, getState, onStoreChanged } from '../recording/store';
import { IDLE_STATE, type CapturedRequest, type RecordingCommand, type RecordingState } from '../recording/types';

/** Rows shown at most; the full session stays in storage. */
const MAX_ROWS = 300;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const versionEl = byId('version');
const statusEl = byId('status');
const statusTextEl = byId('status-text');
const envNameEl = byId('env-name');
const envDetailEl = byId('env-detail');
const allowEl = byId('env-allow');
const allowTextEl = byId('env-allow-text');
const allowButton = byId<HTMLButtonElement>('env-allow-button');
const startButton = byId<HTMLButtonElement>('btn-start');
const pauseButton = byId<HTMLButtonElement>('btn-pause');
const resumeButton = byId<HTMLButtonElement>('btn-resume');
const stopButton = byId<HTMLButtonElement>('btn-stop');
const clearButton = byId<HTMLButtonElement>('btn-clear');
const controlMessageEl = byId('control-message');
const filterEl = byId<HTMLSelectElement>('filter');
const countEl = byId('count');
const tbody = byId<HTMLTableElement>('requests').tBodies[0];
const emptyEl = byId('empty');

versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

let current: DynamicsEnvironment | null = null;
let currentTabId: number | null = null;
let allowedHosts: string[] = [];
let recording: RecordingState = IDLE_STATE;
let events: CapturedRequest[] = [];

function renderEnvironment(): void {
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

function renderRecording(): void {
  const active = recording.status === 'recording' || recording.status === 'paused';
  const canStart = current !== null && allowedHosts.includes(current.host) && !active;

  statusEl.dataset.status = recording.status;
  statusTextEl.textContent = {
    idle: 'Not recording',
    recording: `Recording ${recording.host ?? ''}`,
    paused: `Paused (${recording.host ?? ''})`,
    stopped: 'Stopped',
  }[recording.status];

  startButton.disabled = !canStart;
  pauseButton.disabled = recording.status !== 'recording';
  resumeButton.disabled = recording.status !== 'paused';
  stopButton.disabled = !active;
  clearButton.disabled = events.length === 0;

  if (active && currentTabId !== null && recording.tabId !== currentTabId) {
    controlMessageEl.textContent = 'Recording another tab. Only that tab is captured.';
  } else if (!active && current && !allowedHosts.includes(current.host)) {
    controlMessageEl.textContent = 'Enable this environment to start recording.';
  } else {
    controlMessageEl.textContent = '';
  }
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function cell(text: string, className?: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

type Filter = 'activity' | 'dataverse' | 'all';

interface Row {
  event: CapturedRequest;
  dataverse: DataverseRequest | null;
}

function isShown(row: Row, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (!row.dataverse) return false;
  return filter === 'dataverse' || !row.dataverse.background;
}

function renderEvents(): void {
  const filter = filterEl.value as Filter;
  const all: Row[] = events.map((event) => ({ event, dataverse: parseDataverseRequest(event.method, event.path) }));
  // Events are stored in completion order; list them by start time.
  const shown = all.filter((row) => isShown(row, filter)).sort((a, b) => a.event.start - b.event.start);
  const rows = shown.slice(-MAX_ROWS);
  const hiddenBackground = filter === 'activity' ? all.filter((r) => r.dataverse?.background).length : 0;

  countEl.textContent =
    events.length === 0
      ? ''
      : `${shown.length} shown of ${events.length} captured` +
        (hiddenBackground > 0 ? ` · ${hiddenBackground} background Dataverse calls hidden` : '') +
        (shown.length > rows.length ? ` (latest ${rows.length} listed)` : '');
  emptyEl.hidden = events.length > 0;

  const fragment = document.createDocumentFragment();
  for (const { event: e, dataverse } of rows) {
    const tr = document.createElement('tr');
    const classes = [];
    if (e.status === 0 || e.status >= 400) classes.push('failed');
    if (dataverse?.background) classes.push('background');
    tr.className = classes.join(' ');
    tr.title = [
      `${e.method} ${e.path}`,
      dataverse?.background ? 'Background call made by the app' : '',
      e.serviceRequestId ? `Request ID: ${e.serviceRequestId}` : '',
      e.error ?? '',
      e.fromCache ? 'From cache' : '',
    ]
      .filter(Boolean)
      .join('\n');
    tr.append(
      cell(formatTime(e.start), 'time'),
      cell(dataverse ? operationLabel(dataverse) : e.method, 'op'),
      cell(dataverse ? targetLabel(dataverse) : e.path, 'path'),
      cell(e.status === 0 ? 'failed' : String(e.status)),
      cell(String(e.durationMs), 'num'),
    );
    fragment.append(tr);
  }
  tbody.replaceChildren(fragment);
}

function render(): void {
  renderEnvironment();
  renderRecording();
  renderEvents();
}

async function refreshActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  current = detectDynamics(tab?.url);
  render();
}

async function send(command: RecordingCommand): Promise<void> {
  const response = (await chrome.runtime.sendMessage(command)) as { ok: boolean; error?: string } | undefined;
  if (!response?.ok) controlMessageEl.textContent = response?.error ?? 'The command failed.';
}

function onCommandError(error: unknown): void {
  console.error('[D365 Trace Viewer] Command failed', error);
  controlMessageEl.textContent = 'The command failed.';
}

startButton.addEventListener('click', () => {
  if (!current || currentTabId === null) return;
  send({ type: 'start', tabId: currentTabId, host: current.host }).catch(onCommandError);
});
pauseButton.addEventListener('click', () => send({ type: 'pause' }).catch(onCommandError));
resumeButton.addEventListener('click', () => send({ type: 'resume' }).catch(onCommandError));
stopButton.addEventListener('click', () => send({ type: 'stop' }).catch(onCommandError));
clearButton.addEventListener('click', () => send({ type: 'clear' }).catch(onCommandError));
filterEl.addEventListener('change', renderEvents);

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

onStoreChanged((change) => {
  if (change.state) recording = change.state;
  if (change.events) events = change.events;
  renderRecording();
  if (change.events) renderEvents();
});

chrome.tabs.onActivated.addListener(() => {
  refreshActiveTab().catch(console.error);
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url !== undefined) refreshActiveTab().catch(console.error);
});

Promise.all([getAllowedHosts(), getState(), getEvents(), refreshActiveTab()])
  .then(([hosts, state, stored]) => {
    allowedHosts = hosts;
    recording = state;
    events = stored;
    render();
  })
  .catch((error: unknown) => {
    console.error('[D365 Trace Viewer] Start-up failed', error);
    envNameEl.textContent = 'Not available';
  });
