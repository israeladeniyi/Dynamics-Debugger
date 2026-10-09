// Observes requests with chrome.webRequest (read-only: nothing is blocked or
// changed). Gives method, URL, status, timing and response headers, but never
// request or response bodies. Only Dynamics hosts are visible, because the
// extension's host permission is limited to https://*.dynamics.com/*.
import { classifyUrl, sanitizePath } from './classify';
import type { CapturedRequest, RecordingState } from '../recording/types';

const FILTER: chrome.webRequest.RequestFilter = { urls: ['https://*.dynamics.com/*'] };

interface Pending {
  start: number;
  method: string;
  url: string;
}

/** True when a request belongs to the tab and host being recorded. */
export function isRecorded(
  state: RecordingState,
  details: { tabId: number; url: string; initiator?: string },
): boolean {
  if (state.status !== 'recording' || state.host === null) return false;
  let host: string;
  try {
    host = new URL(details.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host !== state.host) return false;
  if (details.tabId === state.tabId) return true;
  // Requests made by the page's own service worker have no tab.
  return details.tabId === -1 && details.initiator === `https://${state.host}`;
}

function headerValue(headers: chrome.webRequest.HttpHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name)?.value;
}

export function registerNetworkCapture(
  getState: () => Promise<RecordingState>,
  onCaptured: (request: CapturedRequest) => void,
): void {
  const pending = new Map<string, Pending>();

  // Listeners must be registered synchronously at start-up so Edge can wake the
  // service worker for them; the recording state is read inside each handler.
  chrome.webRequest.onBeforeRequest.addListener((details) => {
    void getState().then((state) => {
      if (isRecorded(state, details)) {
        pending.set(details.requestId, { start: details.timeStamp, method: details.method, url: details.url });
      }
    });
    return undefined;
  }, FILTER);

  function finish(
    details: { requestId: string; timeStamp: number; statusCode?: number; fromCache?: boolean; responseHeaders?: chrome.webRequest.HttpHeader[] },
    error?: string,
  ): void {
    // onBeforeRequest's state read is async, so let it settle first.
    void getState().then(() => {
      const started = pending.get(details.requestId);
      if (!started) return;
      pending.delete(details.requestId);
      onCaptured({
        id: details.requestId,
        start: started.start,
        durationMs: Math.max(0, Math.round(details.timeStamp - started.start)),
        method: started.method,
        path: sanitizePath(started.url),
        urlClass: classifyUrl(started.url),
        status: details.statusCode ?? 0,
        error,
        serviceRequestId: headerValue(details.responseHeaders, 'x-ms-service-request-id'),
        fromCache: details.fromCache ?? false,
      });
    });
  }

  chrome.webRequest.onCompleted.addListener((details) => finish(details), FILTER, ['responseHeaders']);
  chrome.webRequest.onErrorOccurred.addListener((details) => finish(details, details.error), FILTER);
}
