import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchRtdb, putRtdbPath, patchRtdbPath, deleteRtdbPath, rtdbRemoteUpdate,
} from '@/redux/realtimeDbSlice';
import type { RootState, AppDispatch, JsonValue, JsonObject } from '@ts/types/constants';
import { getToken } from '@ts/utils/auth';

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

    const token = getToken();
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${wsScheme}://${window.location.host}/api/cms/projects/${projectId}/rtdb/ws?token=${encodeURIComponent(token ?? '')}`
    );
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);
    socket.onmessage = (event) => {
      const { type, path, value } = JSON.parse(event.data);
      dispatch(rtdbRemoteUpdate({ projectId, path, type, value }));
    };

    return () => {
      socket.close();
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
