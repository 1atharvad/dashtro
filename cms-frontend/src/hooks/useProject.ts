import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'advi-ui';
import { fetchProjects, createProject, updateProject, deleteProject, duplicateProject } from '@/redux/projectSlice';
import type { RootState, AppDispatch } from '@ts/types/constants';

export const useProjectData = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { projects, loading, error } = useSelector((state: RootState) => state.projects);

  useEffect(() => {
    if (loading && projects.length === 0) {
      dispatch(fetchProjects());
    }
  }, [dispatch, loading, projects.length]);

  const addProject = (name: string, description = '') =>
    dispatch(createProject({ name, description }));

  const editProject = (projectId: string, name: string, description = '') =>
    dispatch(updateProject({ projectId, data: { name, description } }));

  const removeProject = (projectId: string) =>
    dispatch(deleteProject(projectId)).unwrap()
      .then(() => { toast.success('Project deleted'); return true; })
      .catch(err => { console.error(err); toast.error('Failed to delete project'); return false; });

  const duplicateProjectData = (projectId: string) =>
    dispatch(duplicateProject(projectId)).unwrap()
      .then(newProject => { toast.success('Project duplicated'); return newProject as { _id: string }; })
      .catch(err => { console.error(err); toast.error('Failed to duplicate project'); return null; });

  return { projects, loading, error, addProject, editProject, removeProject, duplicateProjectData };
};
