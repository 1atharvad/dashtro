import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { LayoutTemplate, FolderOpen } from 'lucide-react';
import { AsideItem } from 'advi-ui';
import { Box } from '@mui/material';

import { SchemaComponent } from "@ts/components/SchemaComponent";
import { CollectionComponent } from '@ts/components/CollectionComponent';
import { LinkDrawer } from '@ts/components/LinkDrawer';
import { HamburgerMenu } from '@ts/components/HamburgerMenu';
import { ManageFoldersModal } from '@ts/components/ManageFoldersModal';
import { ProjectSwitcher } from '@ts/components/ProjectSwitcher';

import { useSchemaMetaData } from "@/hooks/useSchemaMetaData";

import '@/scss/Schema.scss';

export const Schema = () => {
  const navigate = useNavigate();
  const { project_id, schema_name } = useParams<{ project_id: string; schema_name: string }>();
  const { schemaNames, loading } = useSchemaMetaData(project_id ?? '');
  const [currentSchemaName, setCurrentSchemaName] = useState('');
  const [manageFoldersOpen, setManageFoldersOpen] = useState(false);
  const drawerRef = useRef<{ handleDrawerToggle: () => void }>(null);

  useEffect(() => {
    setCurrentSchemaName(schema_name || '');
  }, [schema_name]);

  const items: AsideItem[] = [
    {
      icon: <FolderOpen className="h-4 w-4" />,
      label: 'Manage Folders',
      onClick: () => setManageFoldersOpen(true),
    },
    {
      icon: <LayoutTemplate className="h-4 w-4" />,
      label: 'Schemas',
      onClick: () => navigate(`/projects/${project_id}/schema/`),
      active: !currentSchemaName,
    },
  ];

  const schemaSubItems: AsideItem[] = schemaNames.map(name => ({
    icon: <Box sx={{ width: 20 }} />,
    label: name,
    onClick: () => navigate(`/projects/${project_id}/schema/${name}/`),
    active: name === currentSchemaName,
  }));

  return (
    <>
      {!loading && (
        <Box className="schema">
          <ManageFoldersModal
            projectId={project_id ?? ''}
            open={manageFoldersOpen}
            onClose={() => setManageFoldersOpen(false)}
            schemaNames={schemaNames}
          />
          <LinkDrawer className="schema-drawer" items={items} subItems={schemaSubItems} ref={drawerRef} />
          <Box className="schema-content">
            <ProjectSwitcher />
            {currentSchemaName ? (
              <SchemaComponent
                componentName={currentSchemaName}
                newSchema={!schemaNames.includes(currentSchemaName)}
                MenuIcon={() => (
                  <HamburgerMenu
                    className="schema-view-hamburger-menu"
                    handleDrawerToggle={drawerRef.current?.handleDrawerToggle || (() => {})}
                  />
                )}
              />
            ) : (
              <CollectionComponent
                MenuIcon={() => (
                  <HamburgerMenu
                    className="schema-view-hamburger-menu"
                    handleDrawerToggle={drawerRef.current?.handleDrawerToggle || (() => {})}
                  />
                )}
              />
            )}
          </Box>
        </Box>
      )}
    </>
  );
};
