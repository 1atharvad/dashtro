import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Divider, Paper, TextField, Typography } from '@mui/material';
import { ChevronRight, Component, LayoutTemplate, Plus } from 'lucide-react';
import { AsideItem, Button, toast } from 'advi-ui';
import type { AppDispatch, RootState } from '@ts/types/constants';
import { createRichTextComponent, fetchRichTextComponents } from '@/redux/richTextComponentSlice';
import { LinkDrawer } from '@ts/components/LinkDrawer';
import { ProjectSwitcher } from '@ts/components/ProjectSwitcher';
import { PageWrapper } from '@ts/components/PageForm';
import { ModalContentBtn } from '@ts/components/ModalContentBtn';
import { DEFAULT_COMPONENT_CSS, DEFAULT_COMPONENT_SOURCE, DEFAULT_SAMPLE_HTML } from '@ts/config/richTextComponentDefaults';
import '@/scss/DocCollection.scss';
import '@/scss/RichTextComponents.scss';

const PASCAL_CASE_NAME = /^[A-Z][a-zA-Z]*$/;

// Defined at module scope (not inline in RichTextComponentsList) so its identity
// is stable across re-renders — an inline definition would remount the Dialog
// (and its focused input) on every parent re-render.
const NewComponentModalBtn = ({ existingNames }: { existingNames: string[] }) => {
  const { project_id } = useParams<{ project_id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [closeModal, setCloseModal] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNameValue(event.target.value);
    setErrorMessage('');
  };

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const trimmedName = nameValue.trim();
    if (!project_id || !trimmedName) {
      setErrorMessage('Component name required.');
      return;
    }
    if (!PASCAL_CASE_NAME.test(trimmedName)) {
      const message = "Must be PascalCase without numbers (e.g. 'CalloutBox').";
      setErrorMessage(message);
      toast.error(message);
      return;
    }
    if (existingNames.includes(trimmedName)) {
      const message = `${trimmedName} component already exists.`;
      setErrorMessage(message);
      toast.error(message);
      return;
    }
    dispatch(createRichTextComponent({
      projectId: project_id,
      name: trimmedName,
      source: DEFAULT_COMPONENT_SOURCE,
      css: DEFAULT_COMPONENT_CSS,
      sampleHtml: DEFAULT_SAMPLE_HTML,
    }))
      .unwrap()
      .then(({ component }) => {
        setCloseModal(true);
        navigate(`/projects/${project_id}/schema/components/${component.id}/`);
        setTimeout(() => setCloseModal(false), 0);
      })
      .catch((err: Error) => {
        setErrorMessage(err.message);
        toast.error(err.message);
      });
  };

  return (
    <ModalContentBtn
      id="new-component"
      modalTitle="Create New Component"
      closeModal={closeModal}
      modalBtn={handleOpen => (
        <Button variant="default" className="border-current" onClick={handleOpen}>
          <Plus className="h-4 w-4" /> New Component
        </Button>
      )}
    >
      <Box component="form" onSubmit={handleCreate} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField
          fullWidth
          id="new-component-name"
          name="new-component-name"
          label="Component Name"
          value={nameValue}
          onChange={handleChange}
          error={!!errorMessage}
          helperText={errorMessage || "PascalCase, e.g. 'CalloutBox'"}
          required
          autoFocus
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button variant="default" type="submit" className="border-current">
            <Plus className="h-4 w-4" /> Create
          </Button>
        </Box>
      </Box>
    </ModalContentBtn>
  );
};

export const RichTextComponentsList = () => {
  const { project_id } = useParams<{ project_id: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const components = useSelector(
    (state: RootState) => state.richTextComponents.byProject[project_id ?? ''] ?? []
  );

  useEffect(() => {
    if (project_id) dispatch(fetchRichTextComponents(project_id));
  }, [dispatch, project_id]);

  const toEditor = (id: string) => navigate(`/projects/${project_id}/schema/components/${id}/`);

  const drawerItems: AsideItem[] = [
    {
      icon: <LayoutTemplate className="h-4 w-4" />,
      label: 'Schemas',
      onClick: () => navigate(`/projects/${project_id}/schema/`),
    },
    { label: 'Components', type: 'divider' as const },
    ...components.map(c => ({
      icon: <Component className="h-4 w-4" />,
      label: c.name,
      onClick: () => toEditor(c.id),
    })),
  ];

  return (
    <Box className="collection" sx={{ display: 'flex', minHeight: '100vh' }}>
      <LinkDrawer className="collection-drawer" items={drawerItems} />

      <Box className="collection-content">
        <ProjectSwitcher />

        <PageWrapper
          wrapperTitle="Components"
          extraButtons={[<NewComponentModalBtn key="new" existingNames={components.map(c => c.name)} />]}
        >
          {components.length === 0 ? (
            <Box className="empty-container">
              <Typography component="h3">No components created, create a new component.</Typography>
              <NewComponentModalBtn existingNames={components.map(c => c.name)} />
            </Box>
          ) : (
            <Paper className="collection-document-container">
              {components.map(c => (
                <Box key={c.id} className="document-row">
                  <Box className="document-row-inner">
                    <Button
                      variant="ghost"
                      className="collection-document"
                      onClick={() => toEditor(c.id)}
                    >
                      <Box className="document-container">
                        <Box className="document-title">
                          <Component className="h-4 w-4" />
                          <Typography component="h3">{c.name}</Typography>
                        </Box>
                        <Box className="document-icon-bar">
                          <ChevronRight className="navigation-icon h-4 w-4" />
                        </Box>
                      </Box>
                    </Button>
                  </Box>
                  <Divider />
                </Box>
              ))}
            </Paper>
          )}
        </PageWrapper>
      </Box>
    </Box>
  );
};
