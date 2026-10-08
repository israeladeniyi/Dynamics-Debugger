// The single normalized event shape every captured signal is converted into
// before it reaches the UI (development plan, section 4).

export type TraceCategory = 'network' | 'navigation' | 'client-error';

export type TraceOperation = 'Retrieve' | 'RetrieveMultiple' | 'Create' | 'Update' | 'Delete' | 'Other';

export type TraceSeverity = 'info' | 'success' | 'warning' | 'error';

export interface TraceEvent {
  id: string;
  /** Epoch milliseconds when the activity started. */
  timestamp: number;
  category: TraceCategory;
  operation: TraceOperation;
  /** Dataverse table / entity set, e.g. "incidents". */
  resource?: string;
  /** Record id, only when safe and available. */
  recordId?: string;
  method?: string;
  /** URL with query values and identifiers sanitized. */
  route?: string;
  status?: number;
  durationMs?: number;
  /** x-ms-service-request-id or similar, when the response exposes one. */
  correlationId?: string;
  severity: TraceSeverity;
  /** Sanitized request/response details, shown only when expanded. */
  details?: Record<string, unknown>;
}
