import { MouseEvent, useEffect, useState } from "react";
import {
  Box, Chip, Divider, IconButton, Typography, Grid, Paper,
} from "@mui/material";
import { Button, Menu as AdviMenu } from 'advi-ui';
import { ChevronRight as NavigateNextIcon, GripVertical as DragIndicatorIcon, Trash2 as DeleteIcon, LayoutTemplate as SchemaIcon, FilePlus as NewDocIcon, CloudUpload as UploadIcon, CloudDownload as DownloadIcon, MoreVertical as MoreIcon } from "lucide-react";
import { Link as BrowserLink } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { PageWrapper } from "@ts/components/PageForm";
import { WorkspaceSyncModal } from "@ts/components/WorkspaceSyncModal";
import { useDocumentData } from "@/hooks/useDocument";
import { useWorkspaceData } from "@/hooks/useWorkspace";
import type { WorkspaceDiff, SchemaCollectionItem } from "@ts/types/constants";
import {
  DndContext, DragEndEvent, PointerSensor,
  useSensor, useSensors, closestCenter
} from '@dnd-kit/core';
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableDocumentItem = ({
  id, label, base, isProduction, onDelete, status
}: {
  id: string;
  label?: string;
  base: string;
  isProduction: boolean;
  onDelete: (id: string) => void;
  status?: string;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });

  return (
    <Box
      ref={setNodeRef}
      className={`document-row${isDragging ? ' document-row--dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        zIndex: isDragging ? 10 : 'auto',
      }}
    >
      <Box className="document-row-inner">
        <Box
          {...attributes}
          {...listeners}
          className="drag-handle"
        >
          <DragIndicatorIcon className="drag-icon h-4 w-4" />
        </Box>

        <Button asChild variant="ghost" className="collection-document">
          <BrowserLink to={`${base}/document/${id}/`}>
            <Grid container className="document-container">
              <Grid container columnSpacing={1} className="document-title">
                <Grid><Typography component="h3">{label ?? id}</Typography></Grid>
                {status && (
                  <Grid>
                    <Chip
                      label={status === 'published' ? 'Published' : 'Draft'}
                      size="small"
                      color={status === 'published' ? 'success' : 'default'}
                      sx={{ height: 18, fontSize: '0.65rem', ml: 1 }}
                    />
                  </Grid>
                )}
              </Grid>
              <Grid container columnSpacing={1} className="document-icon-bar">
                {!isProduction && (
                  <Grid>
                    <IconButton className="delete-btn" onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      onDelete(id);
                    }}>
                      <DeleteIcon className="h-4 w-4" />
                    </IconButton>
                  </Grid>
                )}
                <Grid><NavigateNextIcon className="navigation-icon h-4 w-4" /></Grid>
              </Grid>
            </Grid>
          </BrowserLink>
        </Button>
      </Box>
      <Divider />
    </Box>
  );
};

export const DocumentList = ({
  workspaceName,
  collectionName,
  schemaName,
  collections,
}: {
  workspaceName: string,
  collectionName: string,
  schemaName: string,
  collections: SchemaCollectionItem[],
}) => {
  const { project_id = '' } = useParams<{ project_id: string }>();
  const navigate = useNavigate();
  const {
    collDocumentIds, collDocumentLabels, deleteDocumentData, loading,
    pushCollectionData, pullCollectionData, refreshCollection,
  } = useDocumentData(project_id, collectionName, workspaceName);
  const { fetchDiff, getCachedDiff } = useWorkspaceData(project_id);
  const cachedDiff = getCachedDiff(workspaceName);
  const labels = collDocumentLabels[collectionName] ?? {};
  const isProduction = workspaceName === 'production';
  const base = `/projects/${project_id}/workspace/${workspaceName}/collection/${collectionName}`;
  const collectionId = collections.find(c => c._collection_name === collectionName)?._id;

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [diff, setDiff] = useState<WorkspaceDiff | null>(cachedDiff ?? null);
  const [diffLoaded, setDiffLoaded] = useState<boolean>(isProduction || !!cachedDiff);
  const [syncMode, setSyncMode] = useState<'push' | 'pull' | null>(null);

  useEffect(() => {
    setOrderedIds(collDocumentIds[collectionName] ?? []);
  }, [collDocumentIds, collectionName]);

  const refreshDiff = () => {
    if (isProduction) return;
    setDiffLoaded(false);
    fetchDiff(workspaceName)
      .then(setDiff)
      .catch(err => console.error(err))
      .finally(() => setDiffLoaded(true));
  };

  useEffect(() => {
    refreshDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceName, collectionName]);

  const outOfSyncIds = new Set([
    ...(collectionId ? (diff?.[collectionId]?.modified.map(d => d.document_id) ?? []) : []),
    ...(collectionId ? (diff?.[collectionId]?.source_only.map(d => d.document_id) ?? []) : []),
  ]);
  const statuses: Record<string, string> = diffLoaded ? Object.fromEntries(
    orderedIds.map(id => [id, isProduction || !outOfSyncIds.has(id) ? 'published' : 'draft'])
  ) : {};

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedIds(prev => {
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const NewDocumentBtn = () => (
    <Button asChild variant="default" className="border-current">
      <BrowserLink to={`${base}/document/new/`}>
        <NewDocIcon className="h-4 w-4" />New Document
      </BrowserLink>
    </Button>
  );

  const ActionsMenu = () => (
    <AdviMenu
      align="end"
      contentClassName="cms-actions-menu"
      trigger={
        <IconButton size="small">
          <MoreIcon className="h-4 w-4" />
        </IconButton>
      }
      items={[
        {
          value: 'schema',
          label: 'View schema',
          icon: <SchemaIcon className="h-4 w-4" />,
          onSelect: () => navigate(`/projects/${project_id}/schema/${schemaName}/`),
        },
        ...(!isProduction ? [
          {
            value: 'push',
            label: 'Push to production',
            icon: <UploadIcon className="h-4 w-4" />,
            onSelect: () => setSyncMode('push'),
          },
          {
            value: 'pull',
            label: 'Pull from production',
            icon: <DownloadIcon className="h-4 w-4" />,
            onSelect: () => setSyncMode('pull'),
          },
        ] : []),
      ]}
    />
  );

  return (
    <PageWrapper
      wrapperTitle={collectionName}
      extraButtons={
        isProduction
          ? [<ActionsMenu key="actions" />]
          : [
              ...(orderedIds.length > 0 ? [<NewDocumentBtn key="new" />] : []),
              <ActionsMenu key="actions" />,
            ]
      }>
      <WorkspaceSyncModal
        projectId={project_id}
        open={!!syncMode}
        workspaceName={workspaceName}
        mode={syncMode ?? 'push'}
        onClose={() => setSyncMode(null)}
        collectionId={collectionId}
        collectionName={collectionName}
        onPush={() => pushCollectionData().then(refreshDiff)}
        onPull={(resolutions: Record<string, 'production' | 'workspace'>) =>
          pullCollectionData(resolutions).then(() => { refreshCollection(); refreshDiff(); })}
      />
      <Paper className="collection-document-container">
        {!loading && orderedIds.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              {orderedIds.map(id => (
                <SortableDocumentItem
                  key={id}
                  id={id}
                  label={labels[id]}
                  base={base}
                  isProduction={isProduction}
                  onDelete={deleteDocumentData}
                  status={statuses[id]}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : !loading && (
          <Box className="empty-container">
            <Typography component="h3">
              {isProduction ? 'No documents in this collection.' : 'No documents currently added, create a new document.'}
            </Typography>
            {!isProduction && <NewDocumentBtn />}
          </Box>
        )}
      </Paper>
    </PageWrapper>
  );
};
