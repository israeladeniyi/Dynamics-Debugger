import { describe, expect, it } from 'vitest';
import { operationLabel, parseDataverseRequest, targetLabel } from '../src/dataverse/parser';

const API = '/api/data/v9.0/';

function parse(method: string, path: string) {
  const result = parseDataverseRequest(method, API + path);
  if (!result) throw new Error(`Not recognised: ${path}`);
  return result;
}

describe('parseDataverseRequest: table operations', () => {
  it.each([
    ['GET', 'incidents', 'RetrieveMultiple', false],
    ['GET', 'incidents({id})', 'Retrieve', true],
    ['POST', 'incidents', 'Create', false],
    ['POST', 'contacts', 'Create', false],
    ['PATCH', 'incidents({id})', 'Update', true],
    ['PUT', 'incidents({id})/title', 'Update', true],
    ['DELETE', 'incidents({id})', 'Delete', true],
    ['DELETE', 'incidents({id})/description', 'Update', true],
    ['GET', 'accounts(accountnumber=\'A-100\')', 'Retrieve', true],
    ['GET', 'incidents/$count', 'RetrieveMultiple', false],
    ['POST', 'accounts({id})/contact_customer_accounts', 'Other', true],
    ['POST', 'accounts({id})/contact_customer_accounts/$ref', 'Other', true],
    ['DELETE', 'accounts({id})/contact_customer_accounts({id})/$ref', 'Other', true],
  ])('%s %s -> %s', (method, path, operation, hasRecordKey) => {
    const r = parse(method, path);
    expect(r.kind).toBe('table');
    expect(r.operation).toBe(operation);
    expect(r.hasRecordKey).toBe(hasRecordKey);
  });

  it('names the table', () => {
    expect(parse('PATCH', 'incidents({id})').resource).toBe('incidents');
    expect(parse('POST', 'new_projects').resource).toBe('new_projects');
  });

  it('works for other API versions', () => {
    expect(parseDataverseRequest('PATCH', '/api/data/v9.2/incidents({id})')?.operation).toBe('Update');
  });
});

describe('parseDataverseRequest: functions, actions, batch, metadata', () => {
  it('recognises unbound functions and actions', () => {
    const fn = parse('GET', 'msdyn_CheckFeatureStatus(FeatureId=@FeatureId)');
    expect(fn).toMatchObject({ kind: 'function', resource: 'msdyn_CheckFeatureStatus', operation: 'Other' });
    expect(parse('POST', 'CCaaS_CreateConnection')).toMatchObject({ kind: 'action', resource: 'CCaaS_CreateConnection' });
    expect(parse('GET', 'WhoAmI()')).toMatchObject({ kind: 'function', resource: 'WhoAmI' });
  });

  it('recognises bound functions on a table', () => {
    const r = parse(
      'GET',
      'activitypointers/Microsoft.Dynamics.CRM.RetrieveTimelineWallRecords(FetchXml=@xml,Target=@id,RollupType=@rollupType)',
    );
    expect(r).toMatchObject({ kind: 'function', resource: 'RetrieveTimelineWallRecords' });
  });

  it('keeps slashes inside function arguments in one segment', () => {
    expect(parse('GET', "RetrieveSetting(SettingName='a/b')")).toMatchObject({ kind: 'function', resource: 'RetrieveSetting' });
  });

  it('recognises $batch and metadata', () => {
    expect(parse('POST', '$batch')).toMatchObject({ kind: 'batch', background: false });
    expect(parse('GET', "EntityDefinitions(LogicalName='incident')/Attributes")).toMatchObject({
      kind: 'metadata',
      background: true,
    });
  });

  it('tolerates a double slash after the version', () => {
    expect(parse('GET', '/msdyn_agentcopilotsettings({id})')).toMatchObject({ kind: 'table', operation: 'Retrieve' });
  });

  it('returns null outside /api/data/', () => {
    expect(parseDataverseRequest('GET', '/main.aspx')).toBeNull();
    expect(parseDataverseRequest('POST', '/t_EmIOXV0RUfdyat3bySNHte5KE')).toBeNull();
    expect(parseDataverseRequest('GET', '/api/data/v9.0/')).toBeNull();
  });
});

describe('background calls', () => {
  it.each([
    ['GET', 'GetClientMetadata(ClientMetadataQuery=@ClientMetadataQuery)'],
    ['GET', 'msdyn_UCIClientAuth(EndpointEnum=@EndpointEnum)'],
    ['POST', 'GetCopilotSettingsForEnvironment'],
    ['POST', 'CCaaS_CreateConnection'],
    ['POST', 'msdyn_copilotevents'],
    ['GET', 'organizationsettings'],
    ['GET', 'msdyn_rtestructuredtemplateconfigs({id})'],
    ['POST', 'msdyn_UpdateReadStatus'],
    ['POST', 'msdyn_RetrieveEnvironmentVariableValueForCS'],
  ])('%s %s is background', (method, path) => {
    expect(parse(method, path).background).toBe(true);
  });

  it.each([
    ['PATCH', 'incidents({id})'],
    ['POST', 'incidents'],
    ['GET', 'incidents({id})'],
    ['GET', 'activitypointers'],
    ['POST', 'new_EscalateCase'],
    // Called when the user opens the Subject picker.
    ['POST', 'msdyn_GetSubjectHierarchyData'],
    // A write to a config table is not hidden; only its reads are.
    ['PATCH', 'organizationsettings({id})'],
  ])('%s %s is shown', (method, path) => {
    expect(parse(method, path).background).toBe(false);
  });
});

describe('labels', () => {
  it('formats the operation and target columns', () => {
    const update = parse('PATCH', 'incidents({id})');
    expect([operationLabel(update), targetLabel(update)]).toEqual(['Update', 'incidents({id})']);
    const list = parse('GET', 'incidents');
    expect([operationLabel(list), targetLabel(list)]).toEqual(['Retrieve list', 'incidents']);
    const fn = parse('GET', 'msdyn_UCIClientAuth(EndpointEnum=@EndpointEnum,RequestMethod=@RequestMethod)');
    expect([operationLabel(fn), targetLabel(fn)]).toEqual(['Function', 'msdyn_UCIClientAuth()']);
    expect(operationLabel(parse('POST', '$batch'))).toBe('Batch');
  });
});
