import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@ts/api/client';
import type { WorkspaceDiff } from '@ts/types/constants';

export type Workspace = { workspace_name: string; is_production: boolean; created_at: string };

export const workspaceKeys = {
  byProject: (projectId: string) => ['workspaces', projectId] as const,
  diff: (projectId: string, workspaceName: string) =>
    ['workspaceDiff', projectId, workspaceName] as const,
};

export function useWorkspacesQuery(projectId: string) {
  return useQuery({
    queryKey: workspaceKeys.byProject(projectId),
    queryFn: () => apiRequest<Workspace[]>(`/projects/${projectId}/workspaces/`),
    enabled: !!projectId,
  });
}

export function useCreateWorkspaceMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceName: string) =>
      apiRequest<Workspace>(`/projects/${projectId}/workspaces/`, {
        method: 'POST',
        body: JSON.stringify({ workspace_name: workspaceName }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.byProject(projectId) }),
  });
}

export function useDeleteWorkspaceMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceName: string) =>
      apiRequest<void>(`/projects/${projectId}/workspaces/${workspaceName}/`, {
        method: 'DELETE',
        parseJson: false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.byProject(projectId) }),
  });
}

export function usePushToProdMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceName: string) =>
      apiRequest(`/projects/${projectId}/workspaces/${workspaceName}/push-to-prod/`, {
        method: 'POST',
      }),
    onSuccess: (_data, workspaceName) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.diff(projectId, workspaceName) });
    },
  });
}

export function usePullFromProdMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceName,
      resolutions,
    }: {
      workspaceName: string;
      resolutions: Record<string, 'production' | 'workspace'>;
    }) =>
      apiRequest(`/projects/${projectId}/workspaces/${workspaceName}/pull-from-production/`, {
        method: 'POST',
        body: JSON.stringify({ resolutions }),
      }),
    onSuccess: (_data, { workspaceName }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.diff(projectId, workspaceName) });
    },
  });
}

/**
 * Fetch-on-demand, not fetch-on-mount: callers imperatively request a diff
 * (e.g. opening a sync modal) rather than binding to a reactive query.
 * queryClient.fetchQuery both returns the result and populates the shared
 * cache, so getCachedDiff can read it synchronously from another component.
 */
export function useWorkspaceDiff(projectId: string) {
  const queryClient = useQueryClient();

  const fetchDiff = (workspaceName: string) =>
    queryClient.fetchQuery({
      queryKey: workspaceKeys.diff(projectId, workspaceName),
      queryFn: () => apiRequest<WorkspaceDiff>(
        `/projects/${projectId}/workspaces/${workspaceName}/diff-vs-production/`
      ),
    });

  const getCachedDiff = (workspaceName: string) =>
    queryClient.getQueryData<WorkspaceDiff>(workspaceKeys.diff(projectId, workspaceName));

  return { fetchDiff, getCachedDiff };
}
