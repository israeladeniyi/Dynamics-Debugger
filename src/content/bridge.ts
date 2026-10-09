// Runs in the extension's isolated world on Dynamics pages. Forwards error
// details posted by main-world.ts to the background script, which keeps them
// only while this tab is being recorded.
import { toErrorDetail } from '../capture/errorBody';

const SOURCE = 'd365-trace-viewer';

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { source?: unknown; type?: unknown } | null;
  if (!data || data.source !== SOURCE || data.type !== 'error-detail') return;
  const detail = toErrorDetail(data);
  if (!detail) return;
  chrome.runtime.sendMessage({ type: 'error-detail', detail }).catch(() => {
    // The extension was reloaded or updated; this page's bridge is stale.
  });
});
