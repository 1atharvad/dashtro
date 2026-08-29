import { toast } from 'advi-ui';
import {
  useProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useDuplicateProjectMutation,
} from '@ts/api/projects';

export const useProjectData = () => {
  const { data: projects = [], isLoading: loading, error } = useProjectsQuery();
  const createMutation = useCreateProjectMutation();
  const updateMutation = useUpdateProjectMutation();
  const deleteMutation = useDeleteProjectMutation();
  const duplicateMutation = useDuplicateProjectMutation();

  const addProject = (name: string, description = '') =>
    createMutation.mutateAsync({ name, description })
      .catch(err => { console.error(err); toast.error('Failed to create project'); });

  const editProject = (projectId: string, name: string, description = '') =>
    updateMutation.mutateAsync({ projectId, data: { name, description } })
      .catch(err => { console.error(err); toast.error('Failed to update project'); });

  const removeProject = (projectId: string) =>
    deleteMutation.mutateAsync(projectId)
      .then(() => { toast.success('Project deleted'); return true; })
      .catch(err => { console.error(err); toast.error('Failed to delete project'); return false; });

  const duplicateProjectData = (projectId: string) =>
    duplicateMutation.mutateAsync(projectId)
      .then(newProject => { toast.success('Project duplicated'); return newProject; })
      .catch(err => { console.error(err); toast.error('Failed to duplicate project'); return null; });

  return {
    projects,
    loading,
    error: error?.message ?? null,
    addProject,
    editProject,
    removeProject,
    duplicateProjectData,
  };
};
