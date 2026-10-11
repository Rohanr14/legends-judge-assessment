import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import type { JudgeApplicationView } from '../types/types';

export const SESSION_URL = '/api/endorsement/session';

export type SessionRequest = {
  action: 'start' | 'ended' | 'save' | 'submit';
  section: number | 'ranking';
  data?: unknown;
  duration?: number;
  auto?: boolean;
};

export type SessionResult = { ok: boolean; status: number; message?: string; problems?: string[] };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Holds the judge's application as the server last reported it. Requests are sent one at a time, in order,
 * and every response carries the server's clock so countdowns match the deadlines the server enforces.
 */
export function useEndorsementSession(initial: JudgeApplicationView, initialServerNow: number) {
  const router = useRouter();
  const [application, setApplication] = useState(initial);
  const [connectionError, setConnectionError] = useState(false);
  // serverTime ≈ Date.now() + offset
  const offsetRef = useRef(initialServerNow - Date.now());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  /** Converts a server timestamp to this browser's clock, e.g. for a Timer deadline. */
  const toLocalTime = useCallback((serverTime: number) => serverTime - offsetRef.current, []);

  const send = useCallback((request: SessionRequest): Promise<SessionResult> => {
    // Submissions are retried through brief connection drops; auto-saves just wait for the next save.
    const attempts = request.action === 'save' ? 1 : 5;

    const run = async (): Promise<SessionResult> => {
      for (let attempt = 1; ; attempt++) {
        try {
          const response = await fetch(SESSION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          });
          const body = await response.json().catch(() => ({}));
          setConnectionError(false);
          if (typeof body.now === 'number') offsetRef.current = body.now - Date.now();
          if (body.application) setApplication(body.application);
          if (response.status === 401) {
            router.replace('/endorse');
          }
          if (response.status >= 500 && attempt < attempts) {
            await wait(1000 * attempt);
            continue;
          }
          return { ok: response.ok, status: response.status, message: body.message, problems: body.problems };
        } catch {
          setConnectionError(true);
          if (attempt >= attempts) return { ok: false, status: 0 };
          await wait(1000 * attempt);
        }
      }
    };

    const result = queueRef.current.then(run);
    queueRef.current = result.catch(() => undefined);
    return result;
  }, [router]);

  return { application, send, serverNow, toLocalTime, connectionError };
}

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Auto-saves `data` shortly after the judge stops typing, retries failed saves, and makes a last-ditch
 * save if the page is closed or reloaded with unsaved changes.
 */
export function useAutosave<T>(data: T, section: number | 'ranking', send: (request: SessionRequest) => Promise<SessionResult>, enabled = true) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const latestRef = useRef(data);
  const savedJsonRef = useRef(JSON.stringify(data));
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const enabledRef = useRef(enabled);
  latestRef.current = data;
  enabledRef.current = enabled;

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const json = JSON.stringify(latestRef.current);
    if (!enabledRef.current || json === savedJsonRef.current) return;
    setStatus('saving');
    const result = await send({ action: 'save', section, data: latestRef.current });
    if (result.ok) {
      savedJsonRef.current = json;
      setStatus(JSON.stringify(latestRef.current) === json ? 'saved' : 'pending');
    } else if (result.status === 0 || result.status >= 500) {
      setStatus('error');
      timerRef.current = setTimeout(flush, 3000);
    }
    // Other errors mean the section was locked; the page moves on with the server's state.
  }, [send, section]);

  useEffect(() => {
    if (!enabled || JSON.stringify(data) === savedJsonRef.current) return;
    setStatus((prev) => (prev === 'error' ? prev : 'pending'));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 800);
  }, [data, enabled, flush]);

  // Stop pending saves once the section is submitted or the step unmounts.
  const cancel = useCallback(() => clearTimeout(timerRef.current), []);
  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    const handlePageHide = () => {
      const json = JSON.stringify(latestRef.current);
      if (!enabledRef.current || json === savedJsonRef.current) return;
      // keepalive lets the request finish after the page is gone.
      fetch(SESSION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', section, data: latestRef.current }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [section]);

  return { status, cancel };
}
