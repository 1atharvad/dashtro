import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchProjects, createProject, updateProject, deleteProject } from '@/redux/projectSlice';
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
    dispatch(deleteProject(projectId));

  return { projects, loading, error, addProject, editProject, removeProject };
};
