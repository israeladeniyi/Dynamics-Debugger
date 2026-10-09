// Recording state and captured requests live in chrome.storage.session: it is
// in memory only (cleared when the browser closes) but survives the background
// service worker being stopped, which Edge does after ~30 s without events.
import type { ErrorDetail } from '../capture/errorBody';
import { IDLE_STATE, type CapturedRequest, type RecordingState } from './types';

const STATE_KEY = 'recordingState';
const EVENTS_KEY = 'capturedRequests';
const ERRORS_KEY = 'errorDetails';

/** Error details kept per recording, by request ID. */
export type ErrorDetails = Record<string, ErrorDetail>;
export const MAX_ERROR_DETAILS = 500;

/** Oldest requests are dropped beyond this, to stay within storage limits. */
export const MAX_EVENTS = 5000;

export async function getState(): Promise<RecordingState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  return (stored[STATE_KEY] as RecordingState | undefined) ?? IDLE_STATE;
}

export async function setState(state: RecordingState): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: state });
}

export async function getEvents(): Promise<CapturedRequest[]> {
  const stored = await chrome.storage.session.get(EVENTS_KEY);
  return (stored[EVENTS_KEY] as CapturedRequest[] | undefined) ?? [];
}

export function appendCapped<T>(existing: T[], added: T[], max: number): T[] {
  const all = existing.concat(added);
  return all.length > max ? all.slice(all.length - max) : all;
}

// Writes are chained so concurrent appends never overwrite each other.
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => undefined);
  return next;
}

export function appendEvents(added: CapturedRequest[]): Promise<void> {
  return enqueue(async () => {
    const events = await getEvents();
    await chrome.storage.session.set({ [EVENTS_KEY]: appendCapped(events, added, MAX_EVENTS) });
  });
}

export function clearEvents(): Promise<void> {
  return enqueue(() => chrome.storage.session.set({ [EVENTS_KEY]: [], [ERRORS_KEY]: {} }));
}

export async function getErrorDetails(): Promise<ErrorDetails> {
  const stored = await chrome.storage.session.get(ERRORS_KEY);
  return (stored[ERRORS_KEY] as ErrorDetails | undefined) ?? {};
}

export function addErrorDetail(detail: ErrorDetail): Promise<void> {
  return enqueue(async () => {
    const details = await getErrorDetails();
    if (Object.keys(details).length >= MAX_ERROR_DETAILS) return;
    details[detail.requestId] = detail;
    await chrome.storage.session.set({ [ERRORS_KEY]: details });
  });
}

export interface StoreChange {
  state?: RecordingState;
  events?: CapturedRequest[];
  errors?: ErrorDetails;
}

export function onStoreChanged(listener: (change: StoreChange) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return;
    const change: StoreChange = {};
    if (STATE_KEY in changes) change.state = (changes[STATE_KEY].newValue as RecordingState | undefined) ?? IDLE_STATE;
    if (EVENTS_KEY in changes) change.events = (changes[EVENTS_KEY].newValue as CapturedRequest[] | undefined) ?? [];
    if (ERRORS_KEY in changes) change.errors = (changes[ERRORS_KEY].newValue as ErrorDetails | undefined) ?? {};
    if (change.state || change.events || change.errors) listener(change);
  });
}
