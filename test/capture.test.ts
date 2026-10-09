import { describe, expect, it } from 'vitest';
import { classifyUrl, sanitizePath } from '../src/capture/classify';
import { isRecorded } from '../src/capture/network';
import { appendCapped } from '../src/recording/store';
import type { RecordingState } from '../src/recording/types';

const ORG = 'https://contoso.crm11.dynamics.com';

describe('sanitizePath', () => {
  it('drops the query and replaces record GUIDs', () => {
    expect(sanitizePath(`${ORG}/api/data/v9.0/incidents(0f3c2a1b-1111-4a2b-9c3d-123456789abc)?$select=title`)).toBe(
      '/api/data/v9.0/incidents({id})',
    );
  });

  it('removes FetchXML and other query values entirely', () => {
    expect(sanitizePath(`${ORG}/api/data/v9.0/activitypointers?fetchXml=%3Cfetch%3E...secret`)).toBe(
      '/api/data/v9.0/activitypointers',
    );
  });

  it('returns an empty string for an invalid URL', () => {
    expect(sanitizePath('not a url')).toBe('');
  });
});

describe('classifyUrl', () => {
  it.each([
    [`${ORG}/api/data/v9.0/incidents(0f3c2a1b-1111-4a2b-9c3d-123456789abc)`, 'dataverse-api'],
    [`${ORG}/api/data/v9.0/$batch`, 'dataverse-batch'],
    [`${ORG}/api/data/v9.0/GetClientMetadata(ClientMetadataQuery=@ClientMetadataQuery)`, 'dataverse-api'],
    [`${ORG}/main.aspx?appid=1`, 'page'],
    [`${ORG}/uclient/blank.htm`, 'resource'],
    [`${ORG}/%7b000000008132412%7d/webresources/CRM/ClientUtility.js`, 'resource'],
    [`${ORG}/WebResources/Service/_imgs/Incident/Priority/1PriorityIcon.svg`, 'resource'],
    [`${ORG}/_imgs/ico_16_1.svg`, 'resource'],
    [`${ORG}/t_EmIOXV0RUfdyat3bySNHte5KE`, 'other'],
    ['nonsense', 'other'],
  ])('%s -> %s', (url, expected) => {
    expect(classifyUrl(url)).toBe(expected);
  });
});

describe('isRecorded', () => {
  const recording: RecordingState = { status: 'recording', tabId: 7, host: 'contoso.crm11.dynamics.com', startedAt: 1 };

  it('accepts requests from the recorded tab and host', () => {
    expect(isRecorded(recording, { tabId: 7, url: `${ORG}/api/data/v9.0/incidents` })).toBe(true);
  });

  it('accepts tab-less requests from the page service worker of the same host', () => {
    expect(isRecorded(recording, { tabId: -1, url: `${ORG}/api/data/v9.0/incidents`, initiator: ORG })).toBe(true);
  });

  it.each([
    ['another tab', { tabId: 8, url: `${ORG}/api/data/v9.0/incidents` }],
    ['another org', { tabId: 7, url: 'https://other.crm11.dynamics.com/api/data/v9.0/incidents' }],
    ['tab-less from elsewhere', { tabId: -1, url: `${ORG}/api/data/v9.0/incidents`, initiator: 'https://evil.example' }],
  ])('rejects %s', (_label, details) => {
    expect(isRecorded(recording, details)).toBe(false);
  });

  it.each(['idle', 'paused', 'stopped'] as const)('records nothing while %s', (status) => {
    expect(isRecorded({ ...recording, status }, { tabId: 7, url: `${ORG}/api/data/v9.0/incidents` })).toBe(false);
  });
});

describe('appendCapped', () => {
  it('keeps the newest items when over the cap', () => {
    expect(appendCapped([1, 2, 3], [4, 5], 4)).toEqual([2, 3, 4, 5]);
  });

  it('keeps everything under the cap', () => {
    expect(appendCapped([1], [2], 4)).toEqual([1, 2]);
  });
});
