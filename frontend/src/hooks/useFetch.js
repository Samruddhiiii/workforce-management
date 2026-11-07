// src/hooks/useFetch.js
// Loads data from the API and tracks loading / error state.
//
//   const { data, loading, error, reload } = useFetch(() => taskApi.my(filters), [filters.status]);
//
// - Runs again whenever a value in `deps` changes (e.g. a filter).
// - reload() fetches again (after creating/editing something).
// - While reloading, the previous data stays on screen (no flicker).
// - If the component disappears before the answer arrives, the answer is ignored.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../services/api';

export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  // Always call the latest fetcher without listing it as a dependency
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  return { data, loading, error, reload, setData };
}

// Waits until the user stops typing (e.g. search boxes) before using the value.
export function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
