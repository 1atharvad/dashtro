import { useEffect, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { Box, Skeleton } from '@mui/material';
import { AsideItem } from 'advi-ui';

import { DocumentList } from '@ts/components/DocumentList';
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

  if (loading) return (
    <Box className="collection" sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar — mirrors .collection-drawer / LinkDrawer structure */}
      <Box sx={{ width: 240, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', pt: 2, px: 1.5 }}>
        <Skeleton width="55%" height={13} sx={{ mb: 2, ml: 1 }} />
        {[1, 2, 3, 4].map(i => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 0.75, mb: 0.5 }}>
            <Skeleton variant="rounded" width={20} height={20} />
            <Skeleton width="65%" height={14} />
          </Box>
        ))}
      </Box>
      {/* Content — mirrors .collection-content + document list */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, px: 1 }}>
          <Skeleton width={180} height={28} />
          <Skeleton variant="rounded" width={120} height={36} />
        </Box>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, minHeight: 48, borderBottom: i < 6 ? '1px solid' : 'none', borderColor: 'divider' }}>
              <Skeleton variant="circular" width={14} height={14} />
              <Skeleton width={`${30 + (i * 7) % 30}%`} height={14} />
              <Skeleton variant="rounded" width={58} height={18} sx={{ ml: 'auto' }} />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );

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
