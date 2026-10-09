import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_LENGTH, parseErrorBody, toErrorDetail } from '../src/capture/errorBody';

const ID = '8a4b788b-fd08-4f16-b5d4-9f9da63d95c5';

describe('parseErrorBody', () => {
  it('keeps only the code and message', () => {
    const body = JSON.stringify({
      error: {
        code: '0x80040217',
        message: 'Entity msdyn_rtestructuredtemplateconfig With Id = {id} Does Not Exist',
        '@Microsoft.PowerApps.CDS.TraceText': 'plug-in trace with record data',
        '@Microsoft.PowerApps.CDS.InnerError.Message': 'inner',
      },
    });
    expect(parseErrorBody(body)).toEqual({
      code: '0x80040217',
      message: 'Entity msdyn_rtestructuredtemplateconfig With Id = {id} Does Not Exist',
    });
  });

  it('cuts long messages', () => {
    const message = parseErrorBody(JSON.stringify({ error: { message: 'x'.repeat(2000) } }))?.message ?? '';
    expect(message).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(message.endsWith('…')).toBe(true);
  });

  it.each(['not json', '{}', '{"error": "text"}', '{"error": {}}', 'null'])('returns null for %s', (text) => {
    expect(parseErrorBody(text)).toBeNull();
  });
});

describe('toErrorDetail', () => {
  it('accepts a valid detail and lower-cases the request ID', () => {
    expect(toErrorDetail({ requestId: ID.toUpperCase(), status: 400, code: '0x1', message: 'm', extra: 'dropped' })).toEqual({
      requestId: ID,
      status: 400,
      code: '0x1',
      message: 'm',
    });
  });

  it.each([
    [null],
    [{ requestId: 'not-an-id', status: 400, message: 'm' }],
    [{ requestId: ID, status: 200, message: 'm' }],
    [{ requestId: ID, status: 400 }],
    [{ requestId: ID, status: '400', message: 'm' }],
  ])('rejects %j', (value) => {
    expect(toErrorDetail(value)).toBeNull();
  });
});
