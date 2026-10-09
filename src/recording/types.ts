import type { UrlClass } from '../capture/classify';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecordingState {
  status: RecordingStatus;
  /** Tab being recorded; null when idle. */
  tabId: number | null;
  /** Dynamics host being recorded, e.g. "contoso.crm4.dynamics.com". */
  host: string | null;
  startedAt: number | null;
}

/** One observed HTTP request, as captured (before Dataverse interpretation). */
export interface CapturedRequest {
  id: string;
  /** Epoch ms when the request started. */
  start: number;
  durationMs: number;
  method: string;
  /** Path only, query removed, GUIDs replaced by {id}. */
  path: string;
  urlClass: UrlClass;
  /** HTTP status, or 0 when the request failed before a response. */
  status: number;
  /** Network error text from the browser, when the request did not complete. */
  error?: string;
  /** x-ms-service-request-id response header, when present. */
  serviceRequestId?: string;
  fromCache: boolean;
}

export const IDLE_STATE: RecordingState = { status: 'idle', tabId: null, host: null, startedAt: null };

/** Messages the side panel sends to the background script. */
export type RecordingCommand =
  | { type: 'start'; tabId: number; host: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'clear' };
