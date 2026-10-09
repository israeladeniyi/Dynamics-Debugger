// Filtering, sorting and copy-as-text for the timeline. Kept free of DOM code
// so it can be unit tested.
import type { CapturedRequest } from '../recording/types';
import { normalize, type TimelineEvent } from '../timeline/normalizer';

export type Filter = 'activity' | 'dataverse' | 'all';

export function isShown(event: TimelineEvent, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (!event.details.dataverse) return false;
  return filter === 'dataverse' || !event.details.background;
}

/** Events that pass the filter, by start time (requests are stored in completion order). */
export function shownEvents(requests: CapturedRequest[], filter: Filter): TimelineEvent[] {
  return requests
    .map(normalize)
    .filter((event) => isShown(event, filter))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function formatStatus(status: number | undefined): string {
  return status === undefined || status === 0 ? 'failed' : String(status);
}

/** "260 ms", "4.9 s" */
export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** "80 s later", "2 min later" for the gap marker between events. */
export function formatGap(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 120 ? `${s} s later` : `${Math.round(s / 60)} min later`;
}

/** Events further apart than this get a gap marker, so separate actions stand apart. */
export const GAP_MS = 5000;

const COPY_HEADER = ['Time', 'Operation', 'Target', 'Status', 'ms', 'Method', 'Path', 'Request ID', 'Note'];

/**
 * Tab-separated text for the clipboard: pastes into Excel as columns and stays
 * readable in a chat or ticket. Holds only what the panel already stores
 * (sanitized path, no query strings, bodies or headers other than the request ID).
 */
export function eventsToText(events: TimelineEvent[], heading: string): string {
  const lines = events.map((e) => {
    const note = [
      e.details.background ? 'background' : '',
      e.severity === 'warning' ? 'slow' : '',
      e.details.error ?? '',
      e.details.fromCache ? 'from cache' : '',
    ]
      .filter(Boolean)
      .join('; ');
    return [
      formatTime(e.timestamp),
      e.details.operationText,
      e.details.target,
      formatStatus(e.status),
      String(e.durationMs ?? ''),
      e.method ?? '',
      e.route ?? '',
      e.correlationId ?? '',
      note,
    ].join('\t');
  });
  return [heading, COPY_HEADER.join('\t'), ...lines].join('\n') + '\n';
}
