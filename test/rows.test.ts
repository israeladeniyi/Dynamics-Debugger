import { describe, expect, it } from 'vitest';
import { formatTime, rowsToText, shownRows, toRows } from '../src/sidepanel/rows';
import type { CapturedRequest } from '../src/recording/types';

function req(over: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: over.id ?? 'r',
    start: 0,
    durationMs: 10,
    method: 'GET',
    path: '/api/data/v9.0/incidents',
    urlClass: 'dataverse-api',
    status: 200,
    fromCache: false,
    ...over,
  };
}

const T0 = new Date(2026, 9, 9, 11, 22, 9, 848).getTime();
const events = [
  req({ id: 'b', start: T0 + 300, method: 'POST', path: '/api/data/v9.0/$batch', urlClass: 'dataverse-batch' }),
  req({ id: 'a', start: T0, method: 'PATCH', path: '/api/data/v9.0/incidents({id})', status: 204, durationMs: 260, serviceRequestId: 'abc' }),
  req({ id: 'c', start: T0 + 100, path: '/api/data/v9.0/GetClientMetadata(ClientMetadataQuery=@q)' }),
  req({ id: 'd', start: T0 + 200, path: '/uclient/scripts/app.js', urlClass: 'resource', status: 0, error: 'net::ERR_ABORTED' }),
];

describe('shownRows', () => {
  it('filters and sorts by start time', () => {
    const rows = toRows(events);
    expect(shownRows(rows, 'activity').map((r) => r.event.id)).toEqual(['a', 'b']);
    expect(shownRows(rows, 'dataverse').map((r) => r.event.id)).toEqual(['a', 'c', 'b']);
    expect(shownRows(rows, 'all').map((r) => r.event.id)).toEqual(['a', 'c', 'd', 'b']);
  });
});

describe('rowsToText', () => {
  it('writes a heading, a header line and one tab-separated line per row', () => {
    const text = rowsToText(shownRows(toRows(events), 'all'), 'Heading');
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toBe('Heading');
    expect(lines[1]).toBe('Time\tOperation\tTarget\tStatus\tms\tMethod\tPath\tRequest ID\tNote');
    expect(lines[2]).toBe(`${formatTime(T0)}\tUpdate\tincidents({id})\t204\t260\tPATCH\t/api/data/v9.0/incidents({id})\tabc\t`);
    expect(lines[3].split('\t')[8]).toBe('background');
    expect(lines[4].split('\t').slice(1, 4)).toEqual(['GET', '/uclient/scripts/app.js', 'failed']);
    expect(lines[4].endsWith('net::ERR_ABORTED')).toBe(true);
    expect(lines).toHaveLength(6);
  });
});

describe('formatTime', () => {
  it('formats local time with milliseconds', () => {
    expect(formatTime(T0)).toBe('11:22:09.848');
  });
});
