import React, {FormEvent, useEffect, useMemo, useState} from 'react';
import {
  Box, Divider, Fab,
} from "@mui/material";
import { Button, toast } from 'advi-ui';
import { Plus, X, FolderOpen, GripVertical, Upload } from 'lucide-react';
import { Badge } from 'advi-ui';
import { Loading } from 'advi-ui';
import { SchemaEntry } from "@ts/components/SchemaEntry";
import type { SchemaVariablesSchema, NewSchemaFieldInput, SchemaEntryData } from '@ts/types/constants';
import { PageForm } from '@ts/components/PageForm';
import { FolderPickerPopover } from '@ts/components/FolderPickerPopover';
import { SchemaActionsMenu } from '@ts/components/SchemaActionsMenu';
import { ImportSchemaDialog, type ImportedSchemaFile } from '@ts/components/dialogs/ImportSchemaDialog';
import { DeleteSchemaDialog } from '@ts/components/dialogs/DeleteSchemaDialog';
import { useNavigate, useParams } from 'react-router-dom';
import { useSchemaMetaData } from '@/hooks/useSchemaMetaData';
import { useSchemaData } from '@/hooks/useSchema';
import { useCategory } from '@/hooks/useCategory';
import {
  DndContext, DragEndEvent, PointerSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableSchemaEntry = ({
  dndId,
  isExpanded,
  locked,
  ...props
}: {
  dndId: string;
  isExpanded: boolean;
  locked?: boolean;
  id: number | string;
  schemaStructure: SchemaVariablesSchema;
  openedPanelList: [string[], React.Dispatch<React.SetStateAction<string[]>>];
  schemaEntryState: [SchemaEntryData, (updated: SchemaEntryData) => void];
  deleteEntry: () => void;
  disabled?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: dndId, disabled: locked });

  const dragHandle = (
    <Box
      className="schema-drag-handle"
      {...(locked ? {} : { ...attributes, ...listeners })}
      onClick={e => e.stopPropagation()}
      style={{ cursor: locked ? 'default' : 'grab', opacity: locked ? 0.3 : 1 }}
    >
      <GripVertical className="h-4 w-4" />
    </Box>
  );

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), zIndex: isDragging ? 10 : 'auto' }}
      className={isDragging ? 'schema-entry-wrapper--dragging' : undefined}
      sx={{ my: isExpanded ? 2 : 0, transition: 'margin 150ms cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      <SchemaEntry {...props} dragHandle={dragHandle} />
    </Box>
  );
};

export const SchemaComponent = ({
  componentName,
  newSchema = false
}: {
  componentName: string,
  newSchema?: boolean
}) => {
  const navigate = useNavigate();
  const { project_id = '' } = useParams<{ project_id: string }>();
  const { schemaVariables, schemaNames, removeSchemaName } = useSchemaMetaData(project_id);
  const { categories, addCategory, getCategoryForSchema, getGeneralSchemas, getSchemasInCategory, assignSchemaCategory } = useCategory(project_id);
  const [schemaStructure, setSchemaStructure] = useState<SchemaVariablesSchema>({});
  const [folderMenuAnchor, setFolderMenuAnchor] = useState<null | HTMLElement>(null);

  const handleAssignCategory = (schemaName: string, categoryId: string) =>
    assignSchemaCategory(schemaName, categoryId).catch(err => {
      console.error(err);
      toast.error('Failed to update folder');
    });

  const currentCategoryId = getCategoryForSchema(componentName);
  const currentCategoryName = categories.find(c => c.id === currentCategoryId)?.name ?? 'General';

  const allowedSchemaNames = useMemo(() => {
    const catId = getCategoryForSchema(componentName);
    const general = getGeneralSchemas(schemaNames);
    const sameCategory = catId ? getSchemasInCategory(catId, schemaNames) : [];
    return [...new Set([...general, ...sameCategory])].filter(name => name !== componentName);
  }, [componentName, schemaNames, getCategoryForSchema, getGeneralSchemas, getSchemasInCategory]);

  const filteredSchemaStructure = useMemo(() => {
    if (!schemaStructure || !Object.keys(schemaStructure).length) return schemaStructure;
    return {
      ...schemaStructure,
      _nested_schema: { ...schemaStructure._nested_schema, choices: allowedSchemaNames },
      _reference_schema: { ...schemaStructure._reference_schema },
    };
  }, [schemaStructure, allowedSchemaNames]);
  const [schema, setSchema] = useState<SchemaEntryData[]>([]);
  const [emptySchemaEntry, setEmptySchemaEntry] = useState<SchemaEntryData>({});
  const [newSchemaEntry, setNewSchemaEntry] = useState<SchemaEntryData[]>([]);
  const [updatedSchemaDetails, setUpdatedSchemaDetails] = useState<Record<string, NewSchemaFieldInput>>({});
  const [openedPanel, setOpenedPanel] = useState<string[]>([]);
  const [deleteSchemaOpen, setDeleteSchemaOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const lockKey = `schema_locked_${project_id}_${componentName}`;
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    setIsLocked(localStorage.getItem(lockKey) === 'true');
  }, [lockKey]);
  const {schemaNameData, updateSchemaData, addSchemaData, deleteSchemaData} = useSchemaData(project_id, componentName, newSchema);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = () => setOpenedPanel([]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const allIds = [
      ...schema.map(e => String(e['_id'])),
      ...newSchemaEntry.map((_, i) => `new-${i}`),
    ];
    const oldIndex = allIds.indexOf(String(active.id));
    const newIndex = allIds.indexOf(String(over.id));
    const reordered = arrayMove(allIds, oldIndex, newIndex);

    const schemaMap = Object.fromEntries(schema.map(e => [String(e['_id']), e]));
    const newMap = Object.fromEntries(newSchemaEntry.map((e, i) => [`new-${i}`, e]));

    const newSchemaArr: SchemaEntryData[] = [];
    const newNewArr: SchemaEntryData[] = [];
    reordered.forEach(id => {
      if (schemaMap[id]) newSchemaArr.push(schemaMap[id]);
      else if (newMap[id]) newNewArr.push(newMap[id]);
    });

    const indexUpdates: Record<string, NewSchemaFieldInput> = {};
    newSchemaArr.forEach((e, i) => {
      if (e['_index'] !== i + 1) indexUpdates[String(e['_id'])] = { _index: i + 1 };
    });
    if (Object.keys(indexUpdates).length > 0) updateSchemaData(indexUpdates);

    setSchema(newSchemaArr);
    setNewSchemaEntry(newNewArr);
  };

  useEffect(() => {
    if (!newSchema) {
      setSchema(schemaNameData as unknown as SchemaEntryData[]);
      setNewSchemaEntry([]);
    }
  }, [schemaNameData, newSchema]);

  useEffect(() => {
    setOpenedPanel([]);
  }, [componentName]);

  useEffect(() => {
    if (schemaVariables) {
      const emptySchema = Object.entries(schemaVariables).reduce((acc: SchemaEntryData, [key, value]) => {
        if (key == '_id') return acc;
        acc[key] = value.default ?? "";

        if (value.type === 'radio') acc[key] = !!value.required;
        if (key == '_schema_name') acc[key] = componentName;
        return acc;
      }, {});

      setSchemaStructure(schemaVariables);
      setEmptySchemaEntry(emptySchema);
      setNewSchemaEntry(newSchema ? [{...emptySchema, '_index': 1}] : []);
    }
  }, [schemaVariables, componentName, newSchema]);

  const addNewEntry = (event: FormEvent) => {
    event.preventDefault();
    setNewSchemaEntry((prev) => [...prev, Object.entries(emptySchemaEntry).reduce((acc: SchemaEntryData, [key, value]) => {
      if (key === '_index') {
        const index = schema.length + newSchemaEntry.length + 1;
        acc[key] = index;
      } else acc[key] = value
      return acc;
    }, {})]);
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    console.log("Form Data Submitted:", schema, newSchemaEntry, updatedSchemaDetails);

    if (Object.keys(updatedSchemaDetails).length !== 0) updateSchemaData(updatedSchemaDetails);
    setUpdatedSchemaDetails({});
    addSchemaData(newSchemaEntry);
    setOpenedPanel([]);
  };

  const closeFolderMenu = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setFolderMenuAnchor(null);
  };

  const handleToggleLock = () => {
    const next = !isLocked;
    setIsLocked(next);
    localStorage.setItem(lockKey, String(next));
  };

  const handleImport = async (importedFiles: ImportedSchemaFile[]) => {
    let lastFolderName: string | undefined;

    for (const file of importedFiles) {
      lastFolderName = file.folderName ?? lastFolderName;
      // compute _index inside the updater so concurrent imports don't collide
      setNewSchemaEntry(prev => {
        const startIndex = schema.length + prev.length;
        const newEntries = file.fields.map((field, i: number) => ({
          ...emptySchemaEntry,
          ...field,
          _schema_name: componentName,
          _index: startIndex + i + 1,
        }));
        return [...prev, ...newEntries];
      });
    }

    if (lastFolderName) {
      const existing = categories.find(c => c.name === lastFolderName);
      if (existing) {
        handleAssignCategory(componentName, existing.id);
      } else {
        const result = await addCategory(lastFolderName);
        if (result?.id) handleAssignCategory(componentName, result.id);
      }
    }
  };

  const handleDownload = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fields = schema.map(({ _id, _schema_name, _index, ...rest }) => rest);
    const exportable = {
      _folder: currentCategoryName !== 'General' ? currentCategoryName : '',
      fields,
    };
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${componentName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const folderBadge = currentCategoryId ? (
    <Badge variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
      <FolderOpen className="h-3 w-3" />
      {currentCategoryName}
      <X
        className="h-3 w-3"
        style={{ opacity: 0.6, cursor: 'pointer', marginLeft: 2 }}
        onClick={(e) => { e.stopPropagation(); handleAssignCategory(componentName, ''); }}
      />
    </Badge>
  ) : (
    <Badge
      variant="outline"
      onClick={(e: React.MouseEvent<HTMLSpanElement>) => setFolderMenuAnchor(e.currentTarget as HTMLElement)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', border: '1px dashed', opacity: 0.7 }}
    >
      <Plus className="h-3 w-3" />
      Add folder
    </Badge>
  );

  return (
    <>
      {/* Popover lives here so its anchor ref stays stable across FolderBadge re-renders */}
      <FolderPickerPopover
        anchorEl={folderMenuAnchor}
        onClose={closeFolderMenu}
        categories={categories}
        onSelect={(categoryId) => handleAssignCategory(componentName, categoryId)}
      />

      {(schema && schema.length > 0) || newSchema ? (
        <PageForm
            formType='schema'
            onSubmit={handleSubmit}
            formTitle={componentName}
            submitBtnText='Save Schema'
            readOnly={isLocked}
            setOpenedPanel={setOpenedPanel}
            extraButtons={[folderBadge].filter(Boolean) as React.ReactNode[]}
            afterSubmitButtons={newSchema ? [
              <Button key="import-json" variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import from JSON
              </Button>
            ] : [
              <SchemaActionsMenu
                key="actions"
                isLocked={isLocked}
                onToggleLock={handleToggleLock}
                onDownload={handleDownload}
                onDelete={() => setDeleteSchemaOpen(true)}
              />
            ]}>
          <Box>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext
                items={[
                  ...schema.map(e => String(e['_id'])),
                  ...newSchemaEntry.map((_, i) => `new-${i}`),
                ]}
                strategy={verticalListSortingStrategy}
              >
                {schema && schema.map((entry, index: number) => (
                  <SortableSchemaEntry
                      key={String(entry['_id'])}
                      dndId={String(entry['_id'])}
                      locked={isLocked}
                      disabled={isLocked}
                      id={entry['_id'] as string | number}
                      isExpanded={openedPanel.includes(`panel${entry['_id']}`)}
                      schemaStructure={filteredSchemaStructure}
                      openedPanelList={[openedPanel, setOpenedPanel]}
                      schemaEntryState={[entry, (updatedValue) =>
                        setSchema((prevSchema) => {
                          const schemaId = String(entry['_id']);
                          const updatedFields = Object.keys(prevSchema[index])
                            .reduce((acc: SchemaEntryData, key: string) => {
                              const updated_val = updatedValue[key];
                              if (prevSchema[index][key] !== updated_val) acc[key] = updated_val;
                              return acc;
                            }, {});
                          setUpdatedSchemaDetails((prevUpdate) => {
                            if (!(schemaId in prevUpdate)) prevUpdate[schemaId] = {};
                            return Object.entries(prevUpdate).reduce((acc: Record<string, NewSchemaFieldInput>, [key, value]) => {
                              acc[key] = key === schemaId ? {...value, ...updatedFields} : value;
                              return acc;
                            }, {});
                          });
                          return prevSchema.map((e, i) => (i === index ? updatedValue : e));
                        })
                      ]}
                      deleteEntry={() => {
                        deleteSchemaData(String(entry['_id']));
                        setOpenedPanel(p => p.filter(panel => panel !== `panel${entry['_id']}`));
                        if (schema.length <= 1) navigate(`/projects/${project_id}/schema/`);
                      }}
                  />
                ))}
                {newSchemaEntry && newSchemaEntry.map((newEntry, index: number) => (
                  <SortableSchemaEntry
                      key={`new-${index}`}
                      dndId={`new-${index}`}
                      locked={isLocked}
                      disabled={isLocked}
                      id={`new-${index}`}
                      isExpanded={openedPanel.includes(`panelnew-${index}`)}
                      schemaStructure={filteredSchemaStructure}
                      openedPanelList={[openedPanel, setOpenedPanel]}
                      schemaEntryState={[newEntry, (updatedValue) =>
                        setNewSchemaEntry(prev => prev.map((e, i) => (i === index ? updatedValue : e)))
                      ]}
                      deleteEntry={() => {
                        setOpenedPanel(p => p.filter(panel => panel !== `panelnew-${index}`));
                        setNewSchemaEntry(prev => prev.filter((_, i) => i !== index));
                      }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </Box>
          {!isLocked && (
            <Divider className='add-new-btn'>
              <Fab color="primary" size="medium" aria-label="add" title='Add new variable' onClick={addNewEntry}>
                <Plus className="h-4 w-4" />
              </Fab>
            </Divider>
          )}
        </PageForm>
      ) : (
        <Box className='schema-component-skeleton'>
          <Loading text="Loading schema…"/>
        </Box>
      )}

      <ImportSchemaDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      <DeleteSchemaDialog
        open={deleteSchemaOpen}
        onClose={() => setDeleteSchemaOpen(false)}
        schemaName={componentName}
        fieldIds={schema.map(entry => String(entry['_id']))}
        deleteSchemaData={deleteSchemaData}
        removeSchemaName={removeSchemaName}
        onDeleted={() => navigate(`/projects/${project_id}/schema/`)}
      />
    </>
  )
}