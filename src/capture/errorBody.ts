// Reads the error code and message from a failed Dataverse Web API response.
// Only those two fields are kept: the rest of an error body (TraceText, plug-in
// trace, inner exceptions) can hold record data and stays out until an explicit
// diagnostic mode exists (development plan, Milestone 8).
//
// Dataverse error body: {"error": {"code": "0x80040217", "message": "...", ...}}

export interface ErrorDetail {
  /** x-ms-service-request-id of the failed response; links it to the captured request. */
  requestId: string;
  status: number;
  code?: string;
  message?: string;
}

/** Longer messages are cut, to keep stored data small. */
export const MAX_MESSAGE_LENGTH = 500;

const REQUEST_ID = /^[0-9a-f-]{36}$/i;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function parseErrorBody(text: string): { code?: string; message?: string } | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const error = (body as { error?: unknown } | null)?.error;
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const result = { code: clip(code, 40), message: clip(message, MAX_MESSAGE_LENGTH) };
  return result.code || result.message ? result : null;
}

/** Validates an error detail received from a content script before it is stored. */
export function toErrorDetail(value: unknown): ErrorDetail | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.requestId !== 'string' || !REQUEST_ID.test(v.requestId)) return null;
  if (typeof v.status !== 'number' || v.status < 400 || v.status > 599) return null;
  const code = clip(v.code, 40);
  const message = clip(v.message, MAX_MESSAGE_LENGTH);
  if (!code && !message) return null;
  return { requestId: v.requestId.toLowerCase(), status: v.status, code, message };
}
