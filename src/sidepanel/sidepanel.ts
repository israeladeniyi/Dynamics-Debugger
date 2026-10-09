// Side panel entry point. Shows which Dynamics environment the active tab is
// on, whether tracing is enabled for it, the recording controls, and the
// timeline of captured requests: status colour, duration and expandable Details.
import { detectDynamics, type DynamicsEnvironment } from '../dataverse/detect';
import { getAllowedHosts, onAllowedHostsChanged, setHostAllowed } from '../settings/allowedHosts';
import { getEvents, getState, onStoreChanged } from '../recording/store';
import { IDLE_STATE, type CapturedRequest, type RecordingCommand, type RecordingState } from '../recording/types';
import type { TimelineEvent } from '../timeline/normalizer';
import {
  GAP_MS,
  eventsToText,
  formatDuration,
  formatGap,
  formatStatus,
  formatTime,
  isShown,
  shownEvents,
  type Filter,
} from './rows';

/** Events listed at most; the full session stays in storage. */
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
const copyButton = byId<HTMLButtonElement>('btn-copy');
const copyStatusEl = byId('copy-status');
const countEl = byId('count');
const timelineEl = byId<HTMLOListElement>('timeline');
const emptyEl = byId('empty');

versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

let current: DynamicsEnvironment | null = null;
let currentTabId: number | null = null;
let allowedHosts: string[] = [];
let recording: RecordingState = IDLE_STATE;
let events: CapturedRequest[] = [];
/** Events whose Details are open; kept across re-renders. */
const expanded = new Set<string>();

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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function detailsList(e: TimelineEvent): HTMLDListElement {
  const dl = el('dl', 'details');
  const add = (term: string, value: string | undefined) => {
    if (!value) return;
    dl.append(el('dt', undefined, term), el('dd', undefined, value));
  };
  add('Request', `${e.method ?? ''} ${e.route ?? ''}`);
  add('Status', formatStatus(e.status));
  add('Duration', e.durationMs === undefined ? undefined : `${e.durationMs} ms`);
  add('Started', formatTime(e.timestamp));
  add('Request ID', e.correlationId);
  add('Table', e.details.dataverse && e.operation !== 'Other' ? e.resource : undefined);
  add('Error', e.details.error);
  add('Note', [
    e.severity === 'warning' ? 'Slow: took 2 s or more' : '',
    e.details.background ? 'Background call made by the app, not by your action' : '',
    e.details.fromCache ? 'Served from the browser cache' : '',
  ].filter(Boolean).join('. '));
  return dl;
}

function eventItem(e: TimelineEvent, slowest: number): HTMLLIElement {
  const li = el('li', `event sev-${e.severity}${e.details.background ? ' background' : ''}`);
  li.dataset.id = e.id;
  const open = expanded.has(e.id);

  const summary = el('button', 'summary');
  summary.type = 'button';
  summary.setAttribute('aria-expanded', String(open));
  summary.append(
    el('span', 'time', formatTime(e.timestamp)),
    el('span', 'title', e.details.title),
    el('span', 'code', formatStatus(e.status)),
    el('span', 'dur', formatDuration(e.durationMs ?? 0)),
  );
  summary.title = e.route ?? '';

  // Duration bar, relative to the slowest listed event.
  const bar = el('span', 'bar');
  const fill = el('span', 'fill');
  fill.style.width = `${Math.max(1, Math.round(((e.durationMs ?? 0) / slowest) * 100))}%`;
  bar.append(fill);
  summary.append(bar);

  li.append(summary);
  if (open) li.append(detailsList(e));
  return li;
}

function renderEvents(): void {
  const filter = filterEl.value as Filter;
  const shown = shownEvents(events, filter);
  const listed = shown.slice(-MAX_ROWS);
  const hiddenBackground =
    filter === 'activity' ? shownEvents(events, 'dataverse').filter((e) => !isShown(e, 'activity')).length : 0;

  countEl.textContent =
    events.length === 0
      ? ''
      : `${shown.length} shown of ${events.length} captured` +
        (hiddenBackground > 0
          ? ` · ${hiddenBackground} background Dataverse ${hiddenBackground === 1 ? 'call' : 'calls'} hidden`
          : '') +
        (shown.length > listed.length ? ` (latest ${listed.length} listed)` : '');
  emptyEl.hidden = events.length > 0;

  const slowest = Math.max(1, ...listed.map((e) => e.durationMs ?? 0));
  const fragment = document.createDocumentFragment();
  let previous: TimelineEvent | null = null;
  for (const e of listed) {
    if (previous && e.timestamp - previous.timestamp >= GAP_MS) {
      fragment.append(el('li', 'gap', formatGap(e.timestamp - previous.timestamp)));
    }
    fragment.append(eventItem(e, slowest));
    previous = e;
  }
  timelineEl.replaceChildren(fragment);
  copyButton.disabled = shown.length === 0;
}

async function copyShown(): Promise<void> {
  const filter = filterEl.value as Filter;
  const shown = shownEvents(events, filter);
  const label = filterEl.selectedOptions[0]?.textContent ?? filter;
  const heading = `D365 Trace Viewer · ${recording.host ?? current?.host ?? ''} · ${label} · ${shown.length} of ${events.length} captured`;
  await navigator.clipboard.writeText(eventsToText(shown, heading));
  copyStatusEl.textContent = `Copied ${shown.length} rows`;
  setTimeout(() => (copyStatusEl.textContent = ''), 2500);
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
timelineEl.addEventListener('click', (event) => {
  const summary = (event.target as Element).closest('.summary');
  const id = summary?.closest<HTMLElement>('li.event')?.dataset.id;
  if (!id) return;
  if (expanded.has(id)) expanded.delete(id);
  else expanded.add(id);
  renderEvents();
});
copyButton.addEventListener('click', () => {
  copyShown().catch((error: unknown) => {
    console.error('[D365 Trace Viewer] Copy failed', error);
    copyStatusEl.textContent = 'Copy failed';
  });
});

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
  if (change.events) {
    events = change.events;
    if (events.length === 0) expanded.clear();
  }
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
