// Recognises Dataverse Web API requests from their method and sanitized path
// (Milestone 4). Only the URL shape is used: no headers or bodies. Where the
// shape does not say reliably what happened, the operation stays "Other".
//
// Web API URL shapes (https://learn.microsoft.com/power-apps/developer/data-platform/webapi/overview):
//   <set>                     GET = RetrieveMultiple, POST = Create
//   <set>(<key>)              GET = Retrieve, PATCH/PUT = Update, DELETE = Delete
//   <set>(<key>)/<property>   GET = Retrieve, PATCH/PUT/DELETE = Update of that column
//   <set>(<key>)/<nav>/$ref   associate / disassociate -> Other
//   POST <set>(<key>)/<nav>   create a related record -> Other
//   Name(...) / Microsoft.Dynamics.CRM.Name(...)   function (GET) or action (POST)
//   $batch                    several requests in one; contents are not visible here
import type { TraceOperation } from '../models/TraceEvent';
import { isBackgroundCall } from './background';

export type DataverseKind = 'table' | 'function' | 'action' | 'batch' | 'metadata';

export interface DataverseRequest {
  operation: TraceOperation;
  kind: DataverseKind;
  /** Entity set (e.g. "incidents") or function/action name (e.g. "GetClientMetadata"). */
  resource: string;
  /** True when the path addresses one record by key. */
  hasRecordKey: boolean;
  /** Known app/framework call that the user did not directly cause. */
  background: boolean;
}

const API_PREFIX = /^\/api\/data\/v\d+\.\d+\/+/;
const METADATA_SETS = new Set([
  'EntityDefinitions',
  'RelationshipDefinitions',
  'GlobalOptionSetDefinitions',
  'ManagedPropertyDefinitions',
]);
const BOUND_OPERATION = 'Microsoft.Dynamics.CRM.';

/** Splits on "/" outside parentheses, so function arguments stay in one segment. */
function splitSegments(path: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of path) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '/' && depth === 0) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) segments.push(current);
  return segments;
}

function nameOf(segment: string): string {
  const paren = segment.indexOf('(');
  return paren === -1 ? segment : segment.slice(0, paren);
}

/**
 * Entity set names are lower case (e.g. "incidents", "new_projects").
 * Functions and actions use PascalCase (e.g. "WhoAmI", "msdyn_CheckFeatureStatus").
 */
function looksLikeEntitySet(name: string): boolean {
  return name !== '' && name === name.toLowerCase();
}

function operationFor(method: string, isCollection: boolean, hasRest: boolean): TraceOperation {
  if (method === 'GET') return isCollection ? 'RetrieveMultiple' : 'Retrieve';
  if (isCollection) return method === 'POST' && !hasRest ? 'Create' : 'Other';
  switch (method) {
    case 'PATCH':
    case 'PUT':
      return 'Update';
    case 'DELETE':
      return hasRest ? 'Update' : 'Delete';
    default:
      return 'Other';
  }
}

/**
 * Interprets a captured Dataverse request. `path` is the sanitized path as
 * stored (e.g. "/api/data/v9.0/incidents({id})"). Returns null for paths that
 * are not under /api/data/.
 */
export function parseDataverseRequest(method: string, path: string): DataverseRequest | null {
  if (!API_PREFIX.test(path)) return null;
  const verb = method.toUpperCase();
  const segments = splitSegments(path.replace(API_PREFIX, ''));
  if (segments.length === 0) return null;

  const first = segments[0];
  const name = nameOf(first);

  let result: Omit<DataverseRequest, 'background'>;
  if (first === '$batch') {
    result = { operation: 'Other', kind: 'batch', resource: '$batch', hasRecordKey: false };
  } else if (METADATA_SETS.has(name)) {
    result = { operation: 'Other', kind: 'metadata', resource: name, hasRecordKey: false };
  } else if (!looksLikeEntitySet(name)) {
    result = { operation: 'Other', kind: verb === 'GET' ? 'function' : 'action', resource: name, hasRecordKey: false };
  } else {
    const hasRecordKey = first.length > name.length;
    const rest = segments.slice(1);
    const bound = rest.find((s) => s.startsWith(BOUND_OPERATION));
    if (bound) {
      // e.g. systemusers({id})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges(...)
      const boundName = nameOf(bound).slice(BOUND_OPERATION.length);
      result = { operation: 'Other', kind: verb === 'GET' ? 'function' : 'action', resource: boundName, hasRecordKey };
    } else if (rest.includes('$ref')) {
      result = { operation: 'Other', kind: 'table', resource: name, hasRecordKey };
    } else {
      const isCollection = !hasRecordKey || (rest.length > 0 && rest[rest.length - 1] === '$count');
      result = { operation: operationFor(verb, isCollection, rest.length > 0), kind: 'table', resource: name, hasRecordKey };
    }
  }

  return { ...result, background: isBackgroundCall(result.kind, result.resource, result.operation) };
}

/** Short label for the Operation column. */
export function operationLabel(request: DataverseRequest): string {
  switch (request.kind) {
    case 'batch':
      return 'Batch';
    case 'metadata':
      return 'Metadata';
    case 'function':
      return 'Function';
    case 'action':
      return 'Action';
    case 'table':
      return request.operation === 'RetrieveMultiple' ? 'Retrieve list' : request.operation;
  }
}

/**
 * Short target for display: the table or operation name, with "({id})" when one
 * record is addressed. Long function argument lists are dropped; the full path
 * stays in the row tooltip.
 */
export function targetLabel(request: DataverseRequest): string {
  if (request.kind === 'function' || request.kind === 'action') return `${request.resource}()`;
  if (request.kind === 'table' && request.hasRecordKey) return `${request.resource}({id})`;
  return request.resource;
}
