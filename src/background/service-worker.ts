// Background service worker. Makes the toolbar button open the side panel,
// keeps the panel available only on Dynamics 365 tabs, runs recording
// commands from the panel, and captures requests while recording.
import { registerNetworkCapture } from '../capture/network';
import { detectDynamics } from '../dataverse/detect';
import { getAllowedHosts } from '../settings/allowedHosts';
import { toErrorDetail } from '../capture/errorBody';
import { addErrorDetail, appendEvents, clearEvents, getState, onStoreChanged, setState } from '../recording/store';
import { IDLE_STATE, type CapturedRequest, type RecordingCommand, type RecordingState } from '../recording/types';

const PANEL_PATH = 'sidepanel/sidepanel.html';
const NOT_DYNAMICS_TITLE = 'D365 Trace Viewer: open a Dynamics 365 page to use it';
const DYNAMICS_TITLE = 'Open D365 Trace Viewer';
const FLUSH_DELAY_MS = 250;

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

// ---- Recording ----

// One cached promise, so every handler sees the same state in event order.
let currentState: Promise<RecordingState> = getState();
onStoreChanged(({ state }) => {
  if (state) currentState = Promise.resolve(state);
});

async function changeState(next: RecordingState): Promise<void> {
  currentState = Promise.resolve(next);
  await setState(next);
  await showBadge(next);
}

async function showBadge(state: RecordingState): Promise<void> {
  const label = state.status === 'recording' ? 'REC' : state.status === 'paused' ? 'II' : '';
  await chrome.action.setBadgeBackgroundColor({ color: state.status === 'recording' ? '#c50f1f' : '#8a8886' });
  await chrome.action.setBadgeText({ text: label });
}

let buffer: CapturedRequest[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flush(): void {
  flushTimer = undefined;
  const batch = buffer;
  buffer = [];
  if (batch.length > 0) appendEvents(batch).catch(logError('saving events failed'));
}

registerNetworkCapture(
  () => currentState,
  (request) => {
    buffer.push(request);
    flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
  },
);

/**
 * The manifest adds the content scripts only when a page loads. A tab that was
 * open before the extension was installed or reloaded has none, or has a
 * bridge cut off from the reloaded extension ("Extension context
 * invalidated"), so error messages would be lost. Adding them again when
 * recording starts fixes that without a page refresh. main-world.ts skips
 * itself if it already ran; a second bridge only repeats a message, which the
 * store keys by request ID.
 */
async function attachContentScripts(tabId: number): Promise<void> {
  const target = { tabId, allFrames: true };
  try {
    await chrome.scripting.executeScript({ target, files: ['content/main-world.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target, files: ['content/bridge.js'] });
  } catch (error) {
    // Recording still works without them; only the error messages are missing.
    logError('adding content scripts failed')(error);
  }
}

async function runCommand(command: RecordingCommand): Promise<RecordingState> {
  const state = await currentState;
  switch (command.type) {
    case 'start': {
      // Capture only happens on environments the user has enabled.
      const allowed = await getAllowedHosts();
      if (!allowed.includes(command.host)) throw new Error('Tracing is not enabled for this environment.');
      buffer = [];
      await clearEvents();
      await changeState({ status: 'recording', tabId: command.tabId, host: command.host, startedAt: Date.now() });
      await attachContentScripts(command.tabId);
      break;
    }
    case 'pause':
      if (state.status === 'recording') await changeState({ ...state, status: 'paused' });
      break;
    case 'resume':
      if (state.status === 'paused') await changeState({ ...state, status: 'recording' });
      break;
    case 'stop':
      if (state.status === 'recording' || state.status === 'paused') {
        flush();
        await changeState({ ...state, status: 'stopped' });
      }
      break;
    case 'clear':
      buffer = [];
      await clearEvents();
      if (state.status === 'stopped') await changeState(IDLE_STATE);
      break;
  }
  return currentState;
}

/** Error details from the content scripts, kept only for the tab and host being recorded. */
async function receiveErrorDetail(message: unknown, sender: chrome.runtime.MessageSender): Promise<void> {
  const detail = toErrorDetail((message as { detail?: unknown }).detail);
  if (!detail || sender.tab?.id === undefined || !sender.url) return;
  const state = await currentState;
  if (state.status !== 'recording' || state.tabId !== sender.tab.id) return;
  if (new URL(sender.url).host !== state.host) return;
  await addErrorDetail(detail);
}

chrome.runtime.onMessage.addListener((message: RecordingCommand | { type: 'error-detail' }, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message.type === 'error-detail') {
    receiveErrorDetail(message, sender).catch(logError('saving error detail failed'));
    return false;
  }
  // Only the extension's own pages (the side panel) may control recording.
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  runCommand(message)
    .then((state) => sendResponse({ ok: true, state }))
    .catch((error: unknown) => sendResponse({ ok: false, error: String(error instanceof Error ? error.message : error) }));
  return true;
});

// Stop when the recorded tab closes.
chrome.tabs.onRemoved.addListener((tabId) => {
  void currentState.then((state) => {
    if (state.tabId === tabId && (state.status === 'recording' || state.status === 'paused')) {
      flush();
      return changeState({ ...state, status: 'stopped' });
    }
  });
});

void currentState.then(showBadge).catch(logError('badge failed'));
