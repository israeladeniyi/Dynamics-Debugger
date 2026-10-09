// The environments the user has explicitly enabled for tracing. Detection
// alone never enables capture; a host must be in this list first.

const KEY = 'allowedHosts';

export async function getAllowedHosts(): Promise<string[]> {
  const stored = await chrome.storage.sync.get(KEY);
  const hosts = stored[KEY];
  return Array.isArray(hosts) ? hosts.filter((h): h is string => typeof h === 'string') : [];
}

export async function setHostAllowed(host: string, allowed: boolean): Promise<string[]> {
  const current = new Set(await getAllowedHosts());
  if (allowed) current.add(host);
  else current.delete(host);
  const hosts = [...current].sort();
  await chrome.storage.sync.set({ [KEY]: hosts });
  return hosts;
}

export function onAllowedHostsChanged(listener: (hosts: string[]) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && KEY in changes) {
      const next = changes[KEY].newValue;
      listener(Array.isArray(next) ? next : []);
    }
  });
}
