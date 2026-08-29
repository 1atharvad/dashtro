import {
  useWorkspacesQuery,
  useCreateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  usePushToProdMutation,
  usePullFromProdMutation,
  useWorkspaceDiff,
} from '@ts/api/workspaces';

export const useWorkspaceData = (projectId: string) => {
  const { data: workspaces = [], isLoading: loading, error } = useWorkspacesQuery(projectId);
  const createMutation = useCreateWorkspaceMutation(projectId);
  const deleteMutation = useDeleteWorkspaceMutation(projectId);
  const pushMutation = usePushToProdMutation(projectId);
  const pullMutation = usePullFromProdMutation(projectId);
  const { fetchDiff, getCachedDiff } = useWorkspaceDiff(projectId);

  const addWorkspace = (workspaceName: string) => createMutation.mutateAsync(workspaceName);

  const removeWorkspace = (workspaceName: string) => deleteMutation.mutateAsync(workspaceName);

  const pushWorkspaceToProd = (workspaceName: string) => pushMutation.mutateAsync(workspaceName);

  const pullWorkspaceFromProd = (
    workspaceName: string,
    resolutions: Record<string, 'production' | 'workspace'>
  ) => pullMutation.mutateAsync({ workspaceName, resolutions });

  return {
    workspaces,
    loading,
    error: error?.message ?? null,
    addWorkspace,
    removeWorkspace,
    pushWorkspaceToProd,
    fetchDiff,
    getCachedDiff,
    pullWorkspaceFromProd,
  };
};
