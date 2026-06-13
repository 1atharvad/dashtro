import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchWorkspaces, createWorkspace, deleteWorkspace, pushToProd, clearPushSuccess
} from '@/redux/workspaceSlice';
import { RootState, AppDispatch } from '@/redux/store';

export const useWorkspaceData = (projectId: string) => {
  const dispatch = useDispatch<AppDispatch>();
  const { byProject, loading, error, pushSuccess } = useSelector((state: RootState) => state.workspaces);
  const workspaces = byProject[projectId] ?? [];

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

  return {
    workspaces,
    loading,
    error,
    pushSuccess,
    addWorkspace,
    removeWorkspace,
    pushWorkspaceToProd,
    resetPushSuccess,
  };
};
