// Turns captured requests into the rows the side panel lists and copies.
// Kept free of DOM code so it can be unit tested.
import { operationLabel, parseDataverseRequest, targetLabel, type DataverseRequest } from '../dataverse/parser';
import type { CapturedRequest } from '../recording/types';

export type Filter = 'activity' | 'dataverse' | 'all';

export interface Row {
  event: CapturedRequest;
  dataverse: DataverseRequest | null;
}

export function toRows(events: CapturedRequest[]): Row[] {
  return events.map((event) => ({ event, dataverse: parseDataverseRequest(event.method, event.path) }));
}

export function isShown(row: Row, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (!row.dataverse) return false;
  return filter === 'dataverse' || !row.dataverse.background;
}

/** Rows that pass the filter, by start time (events are stored in completion order). */
export function shownRows(rows: Row[], filter: Filter): Row[] {
  return rows.filter((row) => isShown(row, filter)).sort((a, b) => a.event.start - b.event.start);
}

export function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** The visible columns: time, operation, target, status, duration. */
export function rowColumns({ event: e, dataverse }: Row): [string, string, string, string, string] {
  return [
    formatTime(e.start),
    dataverse ? operationLabel(dataverse) : e.method,
    dataverse ? targetLabel(dataverse) : e.path,
    e.status === 0 ? 'failed' : String(e.status),
    String(e.durationMs),
  ];
}

const COPY_HEADER = ['Time', 'Operation', 'Target', 'Status', 'ms', 'Method', 'Path', 'Request ID', 'Note'];

/**
 * Tab-separated text for the clipboard: pastes into Excel as columns and stays
 * readable in a chat or ticket. Holds only what the panel already stores
 * (sanitized path, no query strings, bodies or headers other than the request ID).
 */
export function rowsToText(rows: Row[], heading: string): string {
  const lines = rows.map((row) => {
    const e = row.event;
    const note = [row.dataverse?.background ? 'background' : '', e.error ?? '', e.fromCache ? 'from cache' : '']
      .filter(Boolean)
      .join('; ');
    return [...rowColumns(row), e.method, e.path, e.serviceRequestId ?? '', note].join('\t');
  });
  return [heading, COPY_HEADER.join('\t'), ...lines].join('\n') + '\n';
}
