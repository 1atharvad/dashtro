import { useEffect, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { Box } from '@mui/material';
import { AsideItem } from 'advi-ui';

import { DocumentList } from '@ts/components/DocumentList';
import { LinkDrawer } from '@ts/components/LinkDrawer';
import { CollectionSkeleton } from '@ts/components/skeletons/CollectionSkeleton';

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
  const [currentSchemaName, setCurrentSchemaName] = useState(() =>
    collections.find(c => c['_collection_name'] === collection_name)?.['_schema_name'] ?? ''
  );

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

    setCurrentSchemaName(
      collections.reduce((prev, curr) =>
        curr['_collection_name'] === collection_name ? curr['_schema_name'] : prev,
      '')
    );
  }, [workspace_name, collection_name, collections, loading, navigate, project_id]);

  const items: AsideItem[] = [
    { label: 'Collections', type: 'divider' as const },
    ...collections.map(collection => {
      const name = collection['_collection_name'] as string;
      return {
        icon: <span className="flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold uppercase bg-black/10 dark:bg-white/15">{name[0]}</span>,
        label: name,
        onClick: () => navigate(`/projects/${project_id}/workspace/${workspace_name}/collection/${name}/`),
        active: name === collection_name,
      };
    }),
  ];

  if (loading) return <CollectionSkeleton />;

  return (
    <>
      <Box className="collection" sx={{ display: 'flex', minHeight: '100vh' }}>
          <LinkDrawer
            className="collection-drawer"
            items={items}
          />
          <Box className="collection-content">
            <ProjectSwitcher />
            {collection_name ? (
              <DocumentList
                workspaceName={workspace_name ?? ''}
                collectionName={collection_name}
                schemaName={currentSchemaName}
                collections={collections}
              />
            ) : (
              <></>
            )}
          </Box>
        </Box>
    </>
  );
};
