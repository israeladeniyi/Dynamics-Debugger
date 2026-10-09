// Runs in the Dynamics page's own JavaScript world (MAIN), because only there
// can a script see response bodies. It wraps fetch and XMLHttpRequest without
// changing what the page receives, and only looks at failed (4xx/5xx)
// Dataverse Web API responses. From those it passes the error code and message,
// plus the response's request ID, to the extension's bridge script. Nothing
// else is read or sent. The background script drops it unless this tab is
// being recorded.
import { parseErrorBody } from '../capture/errorBody';

const SOURCE = 'd365-trace-viewer';
// Set once this script has wrapped fetch/XHR in this page, so a second copy
// (the service worker injects one when recording starts) does nothing.
const INSTALLED = Symbol.for('d365-trace-viewer.main-world');
const API_PATH = /^\/api\/data\/v\d+\.\d+\//;
const REQUEST_ID_HEADER = 'x-ms-service-request-id';

function isDataverseApi(url: string): boolean {
  try {
    const u = new URL(url, location.href);
    return u.origin === location.origin && API_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

function report(status: number, requestId: string | null, text: string): void {
  if (!requestId) return;
  const parsed = parseErrorBody(text);
  if (!parsed) return;
  window.postMessage({ source: SOURCE, type: 'error-detail', requestId, status, ...parsed }, location.origin);
}

function install(): void {
  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const result = originalFetch.apply(this, args);
    result
      .then((response) => {
        if (response.status < 400 || !isDataverseApi(response.url)) return;
        const requestId = response.headers.get(REQUEST_ID_HEADER);
        // A clone, so the page can still read the body itself.
        return response
          .clone()
          .text()
          .then((text) => report(response.status, requestId, text));
      })
      .catch(() => undefined);
    return result;
  };

  const requestUrls = new WeakMap<XMLHttpRequest, string>();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    requestUrls.set(this, String(args[1]));
    return (originalOpen as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener('loadend', () => {
      try {
        const url = requestUrls.get(this);
        if (this.status < 400 || !url || !isDataverseApi(url)) return;
        let text: string | null = null;
        if (this.responseType === '' || this.responseType === 'text') text = this.responseText;
        else if (this.responseType === 'json') text = JSON.stringify(this.response);
        if (text) report(this.status, this.getResponseHeader(REQUEST_ID_HEADER), text);
      } catch {
        // Never let tracing break the page.
      }
    });
    return originalSend.call(this, body);
  };
}

const page = window as unknown as Record<symbol, boolean>;
if (!page[INSTALLED]) {
  Object.defineProperty(window, INSTALLED, { value: true });
  install();
}
