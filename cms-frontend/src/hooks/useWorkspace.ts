import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchWorkspaces, createWorkspace, deleteWorkspace, pushToProd, clearPushSuccess,
  fetchWorkspaceDiff, pullFromProd,
} from '@/redux/workspaceSlice';
import type { RootState, AppDispatch } from '@ts/types/constants';

export const useWorkspaceData = (projectId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, diffByWorkspace, loading, error, pushSuccess } =
    useSelector((state: RootState) => state.workspaces);
  const workspaces = byProject[projectId] ?? [];

  const getCachedDiff = (workspaceName: string) => diffByWorkspace[`${projectId}:${workspaceName}`];

  useEffect(() => {
    if (projectId) dispatch(fetchWorkspaces(projectId));
  }, [dispatch, projectId]);

  const addWorkspace = (workspaceName: string) =>
    dispatch(createWorkspace({ projectId, workspaceName }));

  const removeWorkspace = (workspaceName: string) =>
    dispatch(deleteWorkspace({ projectId, workspaceName }));

  const pushWorkspaceToProd = (workspaceName: string) =>
    dispatch(pushToProd({ projectId, workspaceName }));

  const resetPushSuccess = () => dispatch(clearPushSuccess());

  const fetchDiff = (workspaceName: string) =>
    dispatch(fetchWorkspaceDiff({ projectId, workspaceName })).unwrap();

  const pullWorkspaceFromProd = (
    workspaceName: string,
    resolutions: Record<string, 'production' | 'workspace'>
  ) => dispatch(pullFromProd({ projectId, workspaceName, resolutions })).unwrap();

  return {
    workspaces,
    loading,
    error,
    pushSuccess,
    addWorkspace,
    removeWorkspace,
    pushWorkspaceToProd,
    resetPushSuccess,
    fetchDiff,
    getCachedDiff,
    pullWorkspaceFromProd,
  };
};
