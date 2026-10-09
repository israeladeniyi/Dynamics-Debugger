// Converts captured requests into the normalized TraceEvent shape the timeline
// renders (Milestone 5). Interpretation comes from the Dataverse parser; this
// file only decides severity and what goes into Details.
import { operationLabel, parseDataverseRequest, targetLabel } from '../dataverse/parser';
import type { TraceEvent, TraceSeverity } from '../models/TraceEvent';
import type { ErrorDetail } from '../capture/errorBody';
import type { CapturedRequest } from '../recording/types';

/**
 * A request slower than this is marked as a warning. On the user's trial,
 * Case saves took 110-360 ms and creates about 1.1-1.3 s, so 2 s flags real
 * outliers (such as a 4.9 s save) without marking every create.
 */
export const SLOW_MS = 2000;

/** Extra fields the timeline needs; kept in TraceEvent.details. */
export interface TimelineDetails {
  /** One-line summary, e.g. "Update incidents({id})". */
  title: string;
  /** Operation column text, e.g. "Update" or "Function". */
  operationText: string;
  /** Target column text, e.g. "incidents({id})". */
  target: string;
  /** Known app/framework call the user did not directly cause. */
  background: boolean;
  /** True for Dataverse Web API and $batch requests. */
  dataverse: boolean;
  fromCache: boolean;
  /** Browser network error, when the request did not complete. */
  error?: string;
  /** Dataverse error code from the response body, e.g. "0x80040217". */
  errorCode?: string;
  /** Dataverse error message from the response body. */
  errorMessage?: string;
}

export type TimelineEvent = TraceEvent & { details: TimelineDetails };

export function severityOf(status: number, durationMs: number): TraceSeverity {
  if (status === 0 || status >= 400) return 'error';
  if (durationMs >= SLOW_MS) return 'warning';
  return 'success';
}

/** Error details by lower-case request ID. */
export type ErrorLookup = Record<string, ErrorDetail>;

export function normalize(request: CapturedRequest, errors: ErrorLookup = {}): TimelineEvent {
  const parsed = parseDataverseRequest(request.method, request.path);
  const operationText = parsed ? operationLabel(parsed) : request.method;
  const target = parsed ? targetLabel(parsed) : request.path;
  const errorDetail = request.serviceRequestId ? errors[request.serviceRequestId.toLowerCase()] : undefined;
  return {
    id: request.id,
    timestamp: request.start,
    category: 'network',
    operation: parsed?.operation ?? 'Other',
    resource: parsed?.resource,
    method: request.method,
    route: request.path,
    status: request.status,
    durationMs: request.durationMs,
    correlationId: request.serviceRequestId,
    severity: severityOf(request.status, request.durationMs),
    details: {
      title: `${operationText} ${target}`,
      operationText,
      target,
      background: parsed?.background ?? false,
      dataverse: parsed !== null,
      fromCache: request.fromCache,
      error: request.error,
      errorCode: errorDetail?.code,
      errorMessage: errorDetail?.message,
    },
  };
}
