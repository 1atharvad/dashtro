import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { Box } from '@mui/material';
import { BookOpen as LibraryBooksIcon } from 'lucide-react';
import { AsideItem } from 'advi-ui';

import { DocumentList } from '@ts/components/DocumentList';
import { HamburgerMenu } from '@ts/components/HamburgerMenu';
import { LinkDrawer } from '@ts/components/LinkDrawer';

import { useCollectionData } from '@/hooks/useCollection';
import { ProjectSwitcher } from '@ts/components/ProjectSwitcher';

import '@/scss/DocCollection.scss';

export const CollectionContent = () => {
  const navigate = useNavigate();
  const { project_id, workspace_name, collection_name } = useParams<{
    project_id: string;
    workspace_name: string;
    collection_name: string;
  }>();
  const { collections, loading } = useCollectionData(project_id ?? '');
  const [currentCollectionName, setCurrentCollectionName] = useState('');
  const [currentSchemaName, setCurrentSchemaName] = useState('');
  const drawerRef = useRef<{ handleDrawerToggle: () => void }>(null);

  useEffect(() => {
    if (loading) return;

    if (!collection_name) {
      if (collections.length > 0) {
        navigate(
          `/projects/${project_id}/workspace/${workspace_name}/collection/${collections[0]['_collection_name']}/`,
          { replace: true }
        );
      } else {
        navigate(`/projects/${project_id}/schema/`, { replace: true });
      }
      return;
    }

    setCurrentCollectionName(collection_name);
    setCurrentSchemaName(
      collections.reduce((prev, curr) =>
        curr['_collection_name'] === collection_name ? curr['_schema_name'] : prev,
      '')
    );
  }, [workspace_name, collection_name, collections, loading]);

  const items: AsideItem[] = [
    { label: 'Collections', type: 'divider' as const },
    ...collections.map(collection => {
      const name = collection['_collection_name'] as string;
      return {
        icon: <span className="flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold uppercase bg-black/10 dark:bg-white/15">{name[0]}</span>,
        label: name,
        onClick: () => navigate(`/projects/${project_id}/workspace/${workspace_name}/collection/${name}/`),
        active: name === currentCollectionName,
      };
    }),
  ];

  return (
    <>
      {!loading && (
        <Box className="collection">
          <LinkDrawer
            className="collection-drawer"
            items={items}
            ref={drawerRef}
          />
          <Box className="collection-content">
            <ProjectSwitcher />
            {currentCollectionName ? (
              <DocumentList
                workspaceName={workspace_name ?? ''}
                collectionName={currentCollectionName}
                schemaName={currentSchemaName}
                MenuIcon={() => (
                  <HamburgerMenu
                    className="collection-view-hamburger-menu"
                    handleDrawerToggle={drawerRef.current?.handleDrawerToggle || (() => {})}
                  />
                )}
              />
            ) : (
              <></>
            )}
          </Box>
        </Box>
      )}
    </>
  );
};
