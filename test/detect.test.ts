import { describe, expect, it } from 'vitest';
import { detectDynamics } from '../src/dataverse/detect';

describe('detectDynamics', () => {
  it('recognises a model-driven app page and ignores the query string', () => {
    expect(
      detectDynamics('https://contoso.crm4.dynamics.com/main.aspx?appid=1&pagetype=entityrecord&etn=incident&id=abc'),
    ).toEqual({ host: 'contoso.crm4.dynamics.com', org: 'contoso', regionLabel: 'crm4', isAppPage: true });
  });

  it('recognises the default crm region and non-app pages', () => {
    expect(detectDynamics('https://org-dev1.crm.dynamics.com/api/data/v9.2/incidents')).toEqual({
      host: 'org-dev1.crm.dynamics.com',
      org: 'org-dev1',
      regionLabel: 'crm',
      isAppPage: false,
    });
  });

  it('is case-insensitive on host and path', () => {
    expect(detectDynamics('https://Contoso.CRM.Dynamics.com/Main.aspx')?.isAppPage).toBe(true);
  });

  it.each([
    undefined,
    '',
    'not a url',
    'http://contoso.crm.dynamics.com/main.aspx',
    'https://contoso.dynamics.com/',
    'https://make.powerapps.com/',
    'https://contoso.crm.dynamics.com.evil.example/main.aspx',
    'https://a.b.crm.dynamics.com/',
    'edge://extensions',
  ])('rejects %s', (url) => {
    expect(detectDynamics(url)).toBeNull();
  });
});
