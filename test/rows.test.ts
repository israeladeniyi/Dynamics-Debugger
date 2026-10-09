import { describe, expect, it } from 'vitest';
import { eventsToText, formatDuration, formatGap, formatTime, shownEvents } from '../src/sidepanel/rows';
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
const requests = [
  req({ id: 'b', start: T0 + 300, method: 'POST', path: '/api/data/v9.0/$batch', urlClass: 'dataverse-batch' }),
  req({ id: 'a', start: T0, method: 'PATCH', path: '/api/data/v9.0/incidents({id})', status: 204, durationMs: 260, serviceRequestId: 'abc' }),
  req({ id: 'c', start: T0 + 100, path: '/api/data/v9.0/GetClientMetadata(ClientMetadataQuery=@q)' }),
  req({ id: 'd', start: T0 + 200, path: '/uclient/scripts/app.js', urlClass: 'resource', status: 0, error: 'net::ERR_ABORTED' }),
  req({ id: 'e', start: T0 + 400, path: '/api/data/v9.0/incidents({id})', method: 'PATCH', status: 204, durationMs: 4907 }),
];

describe('shownEvents', () => {
  it('filters and sorts by start time', () => {
    expect(shownEvents(requests, 'activity').map((e) => e.id)).toEqual(['a', 'b', 'e']);
    expect(shownEvents(requests, 'dataverse').map((e) => e.id)).toEqual(['a', 'c', 'b', 'e']);
    expect(shownEvents(requests, 'all').map((e) => e.id)).toEqual(['a', 'c', 'd', 'b', 'e']);
  });
});

describe('eventsToText', () => {
  it('writes a heading, a header line and one tab-separated line per event', () => {
    const lines = eventsToText(shownEvents(requests, 'all'), 'Heading').trimEnd().split('\n');
    expect(lines[0]).toBe('Heading');
    expect(lines[1]).toBe('Time\tOperation\tTarget\tStatus\tms\tMethod\tPath\tRequest ID\tNote');
    expect(lines[2]).toBe(`${formatTime(T0)}\tUpdate\tincidents({id})\t204\t260\tPATCH\t/api/data/v9.0/incidents({id})\tabc\t`);
    expect(lines[3].split('\t')[8]).toBe('background');
    expect(lines[4].split('\t').slice(1, 4)).toEqual(['GET', '/uclient/scripts/app.js', 'failed']);
    expect(lines[4].endsWith('net::ERR_ABORTED')).toBe(true);
    expect(lines[6].split('\t')[8]).toBe('slow');
    expect(lines).toHaveLength(7);
  });
});

describe('formatting', () => {
  it('formats local time with milliseconds', () => {
    expect(formatTime(T0)).toBe('11:22:09.848');
  });

  it('formats durations and gaps', () => {
    expect(formatDuration(260)).toBe('260 ms');
    expect(formatDuration(4907)).toBe('4.9 s');
    expect(formatGap(80_000)).toBe('80 s later');
    expect(formatGap(216_000)).toBe('4 min later');
  });
});
