import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchRtdb, putRtdbPath, patchRtdbPath, deleteRtdbPath, rtdbRemoteUpdate,
} from '@/redux/realtimeDbSlice';
import { refreshTokens } from '@ts/utils/auth';
import type { RootState, AppDispatch, JsonValue, JsonObject } from '@ts/types/constants';

export const useRealtimeDb = (projectId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, loading, error } = useSelector((state: RootState) => state.realtimeDb);
  const tree = byProject[projectId] ?? {};

  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (projectId) dispatch(fetchRtdb({ projectId }));
  }, [dispatch, projectId]);

  useEffect(() => {
    if (!projectId) return;

    let stopped = false;
    let retryDelay = 1000;
    const maxRetryDelay = 30000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let firstConnect = true;
    // A WS handshake that's rejected (e.g. an expired idToken cookie) never
    // reaches `onopen` and never exposes a status code to JS — there's no
    // equivalent of authFetch's "retry once after a 401 refresh" here, since
    // there's no 401 to react to. So: if a connection attempt closes without
    // ever opening, refresh the token once and retry immediately, rather
    // than repeatedly retrying against a cookie that's never going to work.
    // Reset once a connection actually opens, so a *later* mid-session
    // expiry also gets its own one refresh-retry rather than being treated
    // as already used up.
    let refreshAttempted = false;

    const connect = () => {
      const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // idToken is an httpOnly cookie — the browser attaches it automatically
      // on the WS handshake (same-origin), no need to pass it explicitly.
      const socket = new WebSocket(
        `${wsScheme}://${window.location.host}/api/cms/projects/${projectId}/rtdb/ws`
      );
      socketRef.current = socket;
      let opened = false;

      socket.onopen = () => {
        opened = true;
        refreshAttempted = false;
        setConnected(true);
        retryDelay = 1000;
        // A reconnect (not the first connect) may have missed writes while
        // the socket was down — re-fetch the full tree to resync instead of
        // silently carrying on with stale local state.
        if (!firstConnect) dispatch(fetchRtdb({ projectId }));
        firstConnect = false;
      };
      socket.onclose = () => {
        setConnected(false);
        if (stopped) return;
        if (!opened && !refreshAttempted) {
          refreshAttempted = true;
          refreshTokens().then(ok => {
            if (!stopped && ok) retryTimer = setTimeout(connect, 0);
            // On failure, refreshTokens() itself already redirects to /login/.
          });
          return;
        }
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
      };
      socket.onerror = () => setConnected(false);
      socket.onmessage = (event) => {
        const { type, path, value } = JSON.parse(event.data);
        dispatch(rtdbRemoteUpdate({ projectId, path, type, value }));
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [dispatch, projectId]);

  const setPath = (path: string, value: JsonValue, raw?: string) =>
    dispatch(putRtdbPath({ projectId, path, value, raw }));
  const updatePath = (path: string, value: JsonObject) =>
    dispatch(patchRtdbPath({ projectId, path, value }));
  const removePath = (path: string) => dispatch(deleteRtdbPath({ projectId, path }));
  const renamePath = (oldPath: string, newPath: string, value: JsonValue) => {
    // Write under the new key first, then remove the old one — if the
    // rename is interrupted, the value survives (under the new key)
    // instead of being lost.
    dispatch(putRtdbPath({ projectId, path: newPath, value }));
    dispatch(deleteRtdbPath({ projectId, path: oldPath }));
  };

  return { tree, loading, error, connected, setPath, updatePath, removePath, renamePath };
};
