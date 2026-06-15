import React, { MouseEvent, useEffect, useState } from "react";
import { Box, Chip, Divider, IconButton, Typography, Grid, Paper } from "@mui/material";
import { Button } from 'advi-ui';
import { ChevronRight as NavigateNextIcon, GripVertical as DragIndicatorIcon, Trash2 as DeleteIcon, LayoutTemplate as SchemaIcon, FilePlus as NewDocIcon } from "lucide-react";
import { Link as BrowserLink } from "react-router-dom";
import { useParams } from "react-router-dom";
import { PageWrapper } from "@ts/components/PageForm";
import { useDocumentData } from "@/hooks/useDocument";
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
  id, base, isProduction, onDelete, status
}: {
  id: string;
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
                <Grid><Typography component="h3">{id}</Typography></Grid>
                <Grid>
                  <Chip
                    label={status === 'published' ? 'Published' : 'Draft'}
                    size="small"
                    color={status === 'published' ? 'success' : 'default'}
                    sx={{ height: 18, fontSize: '0.65rem', ml: 1 }}
                  />
                </Grid>
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
  MenuIcon
}: {
  workspaceName: string,
  collectionName: string,
  schemaName: string
  MenuIcon: () => JSX.Element
}) => {
  const { project_id = '' } = useParams<{ project_id: string }>();
  const { collDocumentIds, collDocumentStatuses, deleteDocumentData, loading } = useDocumentData(
    project_id, collectionName, workspaceName
  );
  const statuses = collDocumentStatuses[collectionName] ?? {};
  const isProduction = workspaceName === 'production';
  const base = `/projects/${project_id}/workspace/${workspaceName}/collection/${collectionName}`;

  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  useEffect(() => {
    setOrderedIds(collDocumentIds[collectionName] ?? []);
  }, [collDocumentIds, collectionName]);

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

  const LinkToSchemaBtn = () => (
    <Button asChild variant="outline">
      <BrowserLink to={`/projects/${project_id}/schema/${schemaName}/`}><SchemaIcon className="h-4 w-4" />Schema</BrowserLink>
    </Button>
  );

  const NewDocumentBtn = () => (
    <Button asChild variant="default" className="border-current">
      <BrowserLink to={`${base}/document/new/`}>
        <NewDocIcon className="h-4 w-4" />New Document
      </BrowserLink>
    </Button>
  );

  return (
    <PageWrapper
      wrapperType="collection"
      wrapperTitle={collectionName}
      MenuIcon={MenuIcon}
      extraButtons={
        orderedIds.length > 0
          ? isProduction
            ? [<LinkToSchemaBtn key="schema" />]
            : [<LinkToSchemaBtn key="schema" />, <NewDocumentBtn key="new" />]
          : [<LinkToSchemaBtn key="schema" />]
      }>
      <Paper className="collection-document-container">
        {!loading && orderedIds.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              {orderedIds.map(id => (
                <SortableDocumentItem
                  key={id}
                  id={id}
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
