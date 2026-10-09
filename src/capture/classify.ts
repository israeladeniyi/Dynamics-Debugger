// Turns a raw request URL into something safe to store and roughly sorted.
// Query strings are dropped entirely: in Dynamics they carry FetchXML, filter
// values and other record data. Record GUIDs in the path become "{id}".

export type UrlClass = 'dataverse-api' | 'dataverse-batch' | 'page' | 'resource' | 'other';

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const RESOURCE_EXT = /\.(js|css|svg|png|gif|jpg|jpeg|ico|woff2?|ttf|resx|htm|html|json|map)$/i;

export function sanitizePath(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return '';
  }
  return path.replace(GUID, '{id}');
}

export function classifyUrl(url: string): UrlClass {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return 'other';
  }
  if (path.startsWith('/api/data/')) {
    return path.endsWith('/$batch') ? 'dataverse-batch' : 'dataverse-api';
  }
  if (path === '/main.aspx' || path.startsWith('/uclient/')) {
    return RESOURCE_EXT.test(path) ? 'resource' : 'page';
  }
  if (path.includes('/webresources/') || path.startsWith('/_imgs/') || RESOURCE_EXT.test(path)) {
    return 'resource';
  }
  return 'other';
}
