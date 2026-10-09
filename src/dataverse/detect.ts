// Recognises Dynamics 365 / model-driven app pages from a tab URL. Only the
// host and path are inspected; query values (record ids, etc.) are ignored.

export interface DynamicsEnvironment {
  /** Full host, e.g. "contoso.crm4.dynamics.com". */
  host: string;
  /** Organization prefix, e.g. "contoso". */
  org: string;
  /** Regional CRM label from the host, e.g. "crm4". */
  regionLabel: string;
  /** True when the page is the model-driven app shell (main.aspx). */
  isAppPage: boolean;
}

// <org>.crm.dynamics.com, <org>.crm4.dynamics.com, ...
const DYNAMICS_HOST = /^([a-z0-9][a-z0-9-]*)\.(crm\d*)\.dynamics\.com$/;

export function detectDynamics(url: string | undefined): DynamicsEnvironment | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase();
  const match = DYNAMICS_HOST.exec(host);
  if (!match) return null;

  return {
    host,
    org: match[1],
    regionLabel: match[2],
    isAppPage: parsed.pathname.toLowerCase() === '/main.aspx',
  };
}
