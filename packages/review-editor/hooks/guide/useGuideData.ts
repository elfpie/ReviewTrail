import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { DEMO_GUIDE, DEMO_GUIDE_ID } from '../../demoGuide';
import type { CodeGuideData } from '@plannotator/shared/guide';

export type { GuideDiffRef, GuideSection, CodeGuideOutput, CodeGuideData } from '@plannotator/shared/guide';

export interface UseGuideDataReturn {
  guide: CodeGuideData | null;
  loading: boolean;
  error: string | null;
  reviewed: boolean[];
  toggleReviewed: (index: number) => void;
  retry: () => void;
}

/** Pad/truncate a persisted reviewed array to the current section count — a
 *  regenerated guide (new jobId) starts fresh, but a stale array shorter or
 *  longer than `sections.length` (server restart, schema drift) shouldn't crash. */
function normalizeReviewed(reviewed: boolean[] | undefined, sectionCount: number): boolean[] {
  const next = new Array(sectionCount).fill(false);
  if (!reviewed) return next;
  for (let i = 0; i < sectionCount; i++) next[i] = !!reviewed[i];
  return next;
}

// Keep the write alive when the reviewer leaves the guide. Review submission
// flushes this same queue before the launcher can close the local server.
const writes = new Map<string, Promise<void>>();

function saveGuideProgress(jobId: string, reviewed: boolean[]) {
  if (jobId === DEMO_GUIDE_ID) return;
  const write = async () => {
    const response = await fetch(`/api/guide/${encodeURIComponent(jobId)}/reviewed`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed }), keepalive: true, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw Error('Could not save guide progress');
  };
  const queued = (writes.get(jobId) ?? Promise.resolve()).then(write).catch(() => {
    toast.error('Could not save reviewed behaviors');
  });
  writes.set(jobId, queued);
  void queued.then(() => { if (writes.get(jobId) === queued) writes.delete(jobId); });
}

export function flushGuideProgress() {
  return Promise.all(writes.values());
}

export function useGuideData(jobId: string): UseGuideDataReturn {
  const [guide, setGuide] = useState<CodeGuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<boolean[]>([]);
  const currentReviewed = useRef<boolean[]>([]);
  // Bumped by retry() to re-run the fetch effect without calling fetchGuide
  // directly — a direct call would return a fresh cleanup closure that the
  // caller (a button's onClick) has nowhere to store, so the in-flight
  // request it just superseded would never get its `cancelled` flag set and
  // could still clobber state after a later retry resolves first.
  const [refreshNonce, setRefreshNonce] = useState(0);

  const fetchGuide = useCallback((): (() => void) | void => {
    if (!jobId) return;
    setLoading(true);
    setError(null);

    // Dev short-circuit: render the demo guide without a backend.
    if (jobId === DEMO_GUIDE_ID) {
      setGuide(DEMO_GUIDE);
      currentReviewed.current = normalizeReviewed(DEMO_GUIDE.reviewed, DEMO_GUIDE.sections.length);
      setReviewed(currentReviewed.current);
      setLoading(false);
      return;
    }

    // Out-of-order guard: jobId can change (switching to a different completed
    // guide) while a previous fetch is still in flight. Without this, a slow
    // response for an OLDER jobId could resolve AFTER a newer jobId's fetch
    // and clobber its state. The effect below tears this down via the
    // returned cleanup whenever jobId changes (or on unmount).
    let cancelled = false;

    fetch(`/api/guide/${jobId}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Guide not found' : `HTTP ${res.status}`);
        return res.json();
      })
      .then((data: CodeGuideData) => {
        if (cancelled) return;
        setGuide(data);
        currentReviewed.current = normalizeReviewed(data.reviewed, data.sections.length);
        setReviewed(currentReviewed.current);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    return fetchGuide();
    // refreshNonce has no bearing on WHAT is fetched (fetchGuide already
    // captures jobId) — it exists purely to force this effect to re-run on
    // retry(), so the cancellation guard below is owned by the same effect
    // instance for every fetch, manual retries included.
  }, [fetchGuide, refreshNonce]);

  const toggleReviewed = useCallback((index: number) => {
    const next = [...currentReviewed.current];
    next[index] = !next[index];
    currentReviewed.current = next;
    setReviewed(next);
    saveGuideProgress(jobId, next);
  }, [jobId]);

  const retry = useCallback(() => setRefreshNonce((n) => n + 1), []);

  return { guide, loading, error, reviewed, toggleReviewed, retry };
}
