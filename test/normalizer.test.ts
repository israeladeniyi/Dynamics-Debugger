import { describe, expect, it } from 'vitest';
import { SLOW_MS, normalize, severityOf } from '../src/timeline/normalizer';
import type { CapturedRequest } from '../src/recording/types';

const base: CapturedRequest = {
  id: '1',
  start: 1000,
  durationMs: 260,
  method: 'PATCH',
  path: '/api/data/v9.0/incidents({id})',
  urlClass: 'dataverse-api',
  status: 204,
  serviceRequestId: 'req-1',
  fromCache: false,
};

describe('severityOf', () => {
  it.each([
    [204, 100, 'success'],
    [304, 5, 'success'],
    [204, SLOW_MS, 'warning'],
    [400, 10, 'error'],
    [500, 10, 'error'],
    [0, 10, 'error'],
  ])('status %i in %i ms -> %s', (status, ms, severity) => {
    expect(severityOf(status, ms)).toBe(severity);
  });
});

describe('normalize', () => {
  it('maps a Case update to a TraceEvent', () => {
    expect(normalize(base)).toEqual({
      id: '1',
      timestamp: 1000,
      category: 'network',
      operation: 'Update',
      resource: 'incidents',
      method: 'PATCH',
      route: '/api/data/v9.0/incidents({id})',
      status: 204,
      durationMs: 260,
      correlationId: 'req-1',
      severity: 'success',
      details: {
        title: 'Update incidents({id})',
        operationText: 'Update',
        target: 'incidents({id})',
        background: false,
        dataverse: true,
        fromCache: false,
        error: undefined,
      },
    });
  });

  it('keeps non-Dataverse requests as method + path', () => {
    const e = normalize({ ...base, method: 'GET', path: '/uclient/app.js', urlClass: 'resource', status: 0, error: 'net::ERR_FAILED' });
    expect(e.operation).toBe('Other');
    expect(e.severity).toBe('error');
    expect(e.details).toMatchObject({ title: 'GET /uclient/app.js', dataverse: false, error: 'net::ERR_FAILED' });
  });

  it('marks background calls', () => {
    const e = normalize({ ...base, method: 'GET', path: '/api/data/v9.0/GetClientMetadata(ClientMetadataQuery=@q)' });
    expect(e.details.background).toBe(true);
  });
});
