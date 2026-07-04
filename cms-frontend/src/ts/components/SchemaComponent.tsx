import React, {FormEvent, useEffect, useMemo, useRef, useState} from 'react';
import {
  Box, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Fab, IconButton, InputBase, ListItemIcon, Menu, MenuItem,
  Popover, Tooltip, Typography,
} from "@mui/material";
import { Button } from 'advi-ui';
import { unwrapResult } from '@reduxjs/toolkit';
import { Plus, X, FolderOpen, GripVertical, MoreHorizontal, Trash2, Lock, Unlock, Download, Upload } from 'lucide-react';
import { Badge } from 'advi-ui';
import { Loading } from 'advi-ui';
import { SchemaEntry } from "@ts/components/SchemaEntry";
import type { SchemaVariablesSchema, NewSchemaFieldInput, SchemaEntryData } from '@ts/types/constants';
import { PageForm } from '@ts/components/PageForm';
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
  const [folderFilter, setFolderFilter] = useState('');
  const filterInputRef = useRef<HTMLInputElement>(null);

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
  const [actionsAnchor, setActionsAnchor] = useState<null | HTMLElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importError, setImportError] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  const lockKey = `schema_locked_${project_id}_${componentName}`;
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    setIsLocked(localStorage.getItem(lockKey) === 'true');
  }, [lockKey]);
  const {schemaNameData, updateSchemaData, addSchemaData, deleteSchemaData} = useSchemaData(project_id, componentName);

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

  const handleDeleteSchema = () => {
    schema.forEach(entry => deleteSchemaData(String(entry['_id'])));
    removeSchemaName(componentName);
    setDeleteSchemaOpen(false);
    navigate(`/projects/${project_id}/schema/`);
  };

  const handleToggleLock = () => {
    const next = !isLocked;
    setIsLocked(next);
    localStorage.setItem(lockKey, String(next));
    setActionsAnchor(null);
  };

  const handleImport = async () => {
    setImportError('');
    if (!importFiles.length) { setImportError('Please select at least one JSON file.'); return; }

    const readFile = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsText(file);
      });

    try {
      let lastFolderName: string | undefined;

      for (const file of importFiles) {
        const text = await readFile(file);
        const parsed = JSON.parse(text);
        let fields: Record<string, unknown>[];

        if (Array.isArray(parsed)) {
          fields = parsed;
        } else if (parsed && Array.isArray(parsed.fields)) {
          fields = parsed.fields;
          lastFolderName = parsed._folder || lastFolderName;
        } else {
          throw new Error(`${file.name}: expected a JSON array or an object with a "fields" array.`);
        }

        // compute _index inside the updater so concurrent reads don't collide
        setNewSchemaEntry(prev => {
          const startIndex = schema.length + prev.length;
          const newEntries = fields.map((field, i: number) => ({
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
          assignSchemaCategory(componentName, existing.id);
        } else {
          const result = unwrapResult(await addCategory(lastFolderName));
          if (result.category?.id) assignSchemaCategory(componentName, result.category.id);
        }
      }

      setImportFiles([]);
      setImportOpen(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Invalid JSON');
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
    setActionsAnchor(null);
  };


  const folderBadge = currentCategoryId ? (
    <Badge variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
      <FolderOpen className="h-3 w-3" />
      {currentCategoryName}
      <X
        className="h-3 w-3"
        style={{ opacity: 0.6, cursor: 'pointer', marginLeft: 2 }}
        onClick={(e) => { e.stopPropagation(); assignSchemaCategory(componentName, ''); }}
      />
    </Badge>
  ) : (
    <Badge
      variant="outline"
      onClick={(e: React.MouseEvent<HTMLSpanElement>) => { setFolderMenuAnchor(e.currentTarget as HTMLElement); setFolderFilter(''); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', border: '1px dashed', opacity: 0.7 }}
    >
      <Plus className="h-3 w-3" />
      Add folder
    </Badge>
  );

  return (
    <>
      {/* Popover lives here so its anchor ref stays stable across FolderBadge re-renders */}
      <Popover
        open={Boolean(folderMenuAnchor)}
        anchorEl={folderMenuAnchor}
        onClose={closeFolderMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { sx: { width: 200, mt: 0.5, borderRadius: 1.5 } },
          transition: { onEntered: () => filterInputRef.current?.focus() },
        }}
      >
        <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <InputBase
            inputRef={filterInputRef}
            fullWidth
            placeholder="Search folders…"
            value={folderFilter}
            onChange={e => setFolderFilter(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') closeFolderMenu(); }}
            sx={{ fontSize: 13 }}
          />
        </Box>
        <Box sx={{ maxHeight: 200, overflowY: 'auto', py: 0.5 }}>
          {categories.filter(c => c.name.toLowerCase().includes(folderFilter.toLowerCase())).length === 0 ? (
            <Typography sx={{ display: 'block', px: 1.5, py: 1, fontSize: 13, color: 'text.secondary' }}>
              {categories.length === 0 ? 'No folders yet' : 'No match'}
            </Typography>
          ) : categories
              .filter(c => c.name.toLowerCase().includes(folderFilter.toLowerCase()))
              .map(cat => (
                <Box
                  key={cat.id}
                  onClick={() => { assignSchemaCategory(componentName, cat.id); closeFolderMenu(); }}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 1.5, py: 0.75, cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <FolderOpen className="h-3.5 w-3.5" style={{ opacity: 0.45 }} />
                  <Typography sx={{ fontSize: 13 }}>{cat.name}</Typography>
                </Box>
              ))
          }
        </Box>
      </Popover>

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
              <Box key="actions">
                <Tooltip title="Actions">
                  <IconButton size="small" onClick={e => setActionsAnchor(e.currentTarget)}>
                    <MoreHorizontal className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={actionsAnchor}
                  open={Boolean(actionsAnchor)}
                  onClose={() => setActionsAnchor(null)}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  slotProps={{ paper: { sx: { width: 200, mt: 0.5, borderRadius: 1.5 } } }}
                >
                  <MenuItem onClick={handleToggleLock} sx={{ fontSize: 13 }}>
                    <ListItemIcon>
                      {isLocked
                        ? <Unlock className="h-4 w-4" />
                        : <Lock className="h-4 w-4" />
                      }
                    </ListItemIcon>
                    {isLocked ? 'Unlock Schema' : 'Lock Schema'}
                  </MenuItem>
                  <MenuItem onClick={handleDownload} sx={{ fontSize: 13 }}>
                    <ListItemIcon><Download className="h-4 w-4" /></ListItemIcon>
                    Download Schema
                  </MenuItem>
                  <Divider />
                  <MenuItem
                    onClick={() => { setActionsAnchor(null); setDeleteSchemaOpen(true); }}
                    sx={{ color: 'error.main', fontSize: 13 }}
                  >
                    <ListItemIcon sx={{ color: 'error.main' }}>
                      <Trash2 className="h-4 w-4" />
                    </ListItemIcon>
                    Delete Schema
                  </MenuItem>
                </Menu>
              </Box>
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

      <Dialog
        open={importOpen}
        onClose={() => { setImportOpen(false); setImportFiles([]); setImportError(''); }}
        fullWidth maxWidth="sm"
      >
        <DialogTitle>Import Schema from JSON</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select one or more <code>.json</code> files. Use <strong>Download Schema</strong> to get the correct format.
          </Typography>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              setImportFiles(Array.from(e.target.files ?? []));
              setImportError('');
            }}
          />
          <Box
            onClick={() => importFileRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: importError ? 'error.main' : 'divider',
              borderRadius: 2,
              px: 3, py: 4,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            <Upload className="h-6 w-6" style={{ opacity: 0.5 }} />
            {importFiles.length > 0 ? (
              <Box sx={{ textAlign: 'center' }}>
                {importFiles.map(f => (
                  <Typography key={f.name} variant="body2" fontWeight={500}>{f.name}</Typography>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">Click to select JSON file(s)</Typography>
            )}
          </Box>
          {importError && (
            <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{importError}</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" onClick={() => { setImportOpen(false); setImportFiles([]); setImportError(''); }}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleImport} disabled={!importFiles.length}>
            Import
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteSchemaOpen} onClose={() => setDeleteSchemaOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Delete schema?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete the <strong>{componentName}</strong> schema and all its fields. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" onClick={() => setDeleteSchemaOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDeleteSchema}>Delete Schema</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}