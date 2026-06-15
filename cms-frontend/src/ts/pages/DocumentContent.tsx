import React, { FormEvent, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from "react-router-dom";
import {
  Box, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Drawer, IconButton, List, ListItem, ListItemButton,
  ListItemText, Tooltip, Typography, useTheme,
} from '@mui/material';
import { Button } from 'advi-ui';
import { Download, History, Trash2, Upload, X } from 'lucide-react';
import '@/scss/DocCollection.scss';
import { useCollectionData } from '@/hooks/useCollection';
import { useSchemaData } from '@/hooks/useSchema';
import { PageForm } from '@ts/components/PageForm';
import { DocumentEntry } from '@ts/components/DocumentEntry';
import { useDocumentData } from '@/hooks/useDocument';
import { Link } from '@ts/components/Link';
import { AppHeader } from '@ts/components/AppHeader';

const PageNavigation = ({
  projectId, workspaceName, collectionName, documentId,
}: {
  projectId: string; workspaceName: string; collectionName: string; documentId: string;
}) => (
  <>
    <Link
      link={{ text: collectionName, url: `/projects/${projectId}/workspace/${workspaceName}/collection/${collectionName}/`, is_external_link: false }}
      className="navigation-link">
      {collectionName}
    </Link> / {documentId}
  </>
);

export const DocumentContent = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { project_id, workspace_name, collection_name, document_id } = useParams<{
    project_id: string; workspace_name: string; collection_name: string; document_id: string;
  }>();

  const [schema, setSchema] = useState<Record<string, any>[]>([]);
  const [emptyDocumentData, setEmptyDocumentData] = useState<Record<string, any>>({});
  const [documentData, setDocumentData] = useState<Record<string, any>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importDocOpen, setImportDocOpen] = useState(false);
  const [importDocError, setImportDocError] = useState('');
  const importDocFileRef = useRef<HTMLInputElement>(null);

  const { collections } = useCollectionData(project_id ?? '');
  const schemaName = collections.reduce((prev, curr) =>
    curr['_collection_name'] === collection_name ? curr['_schema_name'] : prev, '');

  const { schemaDetails, loading: loading1 } = useSchemaData(project_id ?? '', schemaName);
  const {
    collDocumentContent,
    defaultId,
    addDocumentData,
    updateDocumentData,
    updateStatusData,
    deleteDocumentData,
    fetchVersions,
    restoreVersion,
    versions,
    loading: loading2,
  } = useDocumentData(project_id ?? '', collection_name ?? '', workspace_name ?? 'production', document_id);

  const isProduction = workspace_name === 'production';
  const isNew = document_id === defaultId;
  const [error, setError] = useState('');
  const [updatedDocumentDetails, setUpdatedDocumentDetails] = useState<Record<string, any>>({});
  const loadedDocumentIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);
  const maxDepth = 5;
  const loading = loading1 || loading2;

  const currentDoc = (!isNew && collection_name && document_id)
    ? collDocumentContent[collection_name]?.[document_id]
    : null;

  // Use a one-way latch: once data is ready, keep rendering even if loading flips
  // briefly due to mutation requests (updateDocumentData, etc.)
  if (!hasLoadedRef.current && !loading && schema.length > 0 &&
      (isNew ? Object.keys(emptyDocumentData).length > 0 : Object.keys(documentData).length > 0)) {
    hasLoadedRef.current = true;
  }
  const isReady = hasLoadedRef.current;
  const currentStatus: 'draft' | 'published' = currentDoc?._status ?? 'draft';

  useEffect(() => {
    if (!loading && collection_name && !isNew && document_id &&
        document_id !== loadedDocumentIdRef.current &&
        collection_name in collDocumentContent &&
        document_id in collDocumentContent[collection_name]) {
      const content = collDocumentContent[collection_name][document_id];
      if ('error' in content) {
        setError(content['error']);
      } else {
        setDocumentData(content);
        loadedDocumentIdRef.current = document_id;
      }
    }
  }, [loading, collection_name, document_id, collDocumentContent]);

  useEffect(() => {
    loadedDocumentIdRef.current = null;
    hasLoadedRef.current = false;
    setDocumentData({});
    setUpdatedDocumentDetails({});
  }, [document_id]);

  useEffect(() => {
    if (!loading && schemaName && schemaDetails[schemaName]?.length) {
      setSchema(schemaDetails[schemaName]);
      // Only initialize when emptyDocumentData is still the bare {} default.
      // Once the user starts editing (any key is added), we never overwrite.
      setEmptyDocumentData(prev =>
        Object.keys(prev).length === 0
          ? createEmptyDocumentData(schemaDetails, schemaName)
          : prev
      );
    }
  }, [loading, schemaDetails, schemaName]);

  const createEmptyDocumentData = (details: Record<string, any>, name: string, depth = 0): Record<string, any> => {
    const data = details[name] as Record<string, any>[];
    if (!data) return {};
    return data.reduce((acc, field) => {
      const key = field['_name'];
      if (field['_nested_schema']) {
        const isMany = field['_relation'] === 'OneToMany';
        acc[key] = isMany ? [] : depth <= maxDepth ? createEmptyDocumentData(details, field['_nested_schema'], depth + 1) : {};
      } else {
        acc[key] = field['_type'] === 'Boolean' ? field['_default_value'] === 'True' : field['_default_value'];
      }
      return acc;
    }, {} as Record<string, any>);
  };

  const getDocumentId = (id: string, isTitle = false) => {
    const label = id === defaultId ? 'New Document' : id;
    return !isTitle ? label.replace(/\s+/g, '') : label;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isNew) {
      addDocumentData(emptyDocumentData)?.then(result => {
        const newId = result?.['_id'];
        if (collection_name && newId) {
          navigate(`/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/document/${newId}/`);
        }
      });
    } else {
      updateDocumentData(updatedDocumentDetails);
    }
  };

  const handleToggleStatus = () => {
    if (!document_id || isNew || isProduction) return;
    const next: 'draft' | 'published' = currentStatus === 'draft' ? 'published' : 'draft';
    updateStatusData(document_id, next);
  };

  // Ref so onImmediateSave stays stable across renders even though
  // updateDocumentData is recreated on every render by the hook.
  const updateDocumentDataRef = useRef(updateDocumentData);
  updateDocumentDataRef.current = updateDocumentData;

  const onImmediateSave = useCallback((fieldName: string, val: any) => {
    if (isProduction) return;
    updateDocumentDataRef.current({ [fieldName]: val });
  }, [isProduction]);

  const handleOpenHistory = () => {
    if (document_id && !isNew) {
      fetchVersions(document_id);
      setHistoryOpen(true);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!document_id) return;
    await restoreVersion(document_id, versionId);
    // Reload page data after restore
    setHistoryOpen(false);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  const statusBadge = !isNew && !isProduction ? (
    <Tooltip title={`Click to mark as ${currentStatus === 'draft' ? 'published' : 'draft'}`}>
      <Chip
        label={currentStatus === 'published' ? 'Published' : 'Draft'}
        color={currentStatus === 'published' ? 'success' : 'default'}
        size="small"
        onClick={handleToggleStatus}
        sx={{ cursor: 'pointer', fontWeight: 600, height: 24 }}
      />
    </Tooltip>
  ) : isProduction && currentDoc ? (
    <Chip
      label={currentStatus === 'published' ? 'Published' : 'Draft'}
      color={currentStatus === 'published' ? 'success' : 'default'}
      size="small"
      sx={{ fontWeight: 600, height: 24 }}
    />
  ) : null;

  const historyButton = !isNew && !isProduction ? (
    <Tooltip title="Version history">
      <IconButton size="small" onClick={handleOpenHistory}>
        <History className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  ) : null;

  const deleteButton = !isNew && !isProduction ? (
    <Tooltip title="Delete document">
      <IconButton size="small" onClick={() => setDeleteOpen(true)} color="error">
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  ) : null;

  const handleDelete = () => {
    if (!document_id) return;
    deleteDocumentData(document_id);
    setDeleteOpen(false);
    navigate(`/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/`);
  };

  const handleExportDocument = () => {
    const defaults = schema.reduce((acc: Record<string, any>, field: any) => {
      if (field._default_value !== undefined && field._default_value !== '') {
        acc[field._name] = field._default_value;
      }
      return acc;
    }, {});
    const exportable = { ...defaults, ...documentData };
    delete exportable['_id'];
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${collection_name}-${getDocumentId(document_id ?? '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportDocument = (file: File) => {
    setImportDocError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object.');
        const schemaFieldNames = new Set(schema.map((f: any) => f._name));
        setEmptyDocumentData(prev => {
          const merged = { ...prev };
          for (const [key, val] of Object.entries(parsed)) {
            if (schemaFieldNames.has(key)) merged[key] = val;
          }
          return merged;
        });
        setImportDocOpen(false);
      } catch (err: any) {
        setImportDocError(err.message ?? 'Invalid JSON');
      }
    };
    reader.readAsText(file);
  };

  const downloadButton = !isNew && !isProduction ? (
    <Tooltip title="Download document">
      <IconButton size="small" onClick={handleExportDocument}>
        <Download className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  ) : null;

  const importDocButton = isNew ? (
    <Button key="import-doc" variant="secondary" onClick={() => setImportDocOpen(true)}>
      <Upload className="h-4 w-4" /> Import from JSON
    </Button>
  ) : null;

  return (
    <>
      <AppHeader />
      {error === '' ? (
        isReady && (
          <Box className="document" sx={{ paddingTop: '72px' }}>
            <PageForm
                formType="document"
                onSubmit={handleSubmit}
                readOnly={isProduction}
                formTitle={getDocumentId(document_id ?? '', true)}
                titleBadge={statusBadge}
                pageNavigation={
                  <PageNavigation
                    projectId={project_id ?? ''}
                    workspaceName={workspace_name ?? 'production'}
                    collectionName={collection_name ?? ''}
                    documentId={getDocumentId(document_id ?? '')}
                  />
                }
                extraButtons={[historyButton, downloadButton, deleteButton].filter(Boolean) as React.ReactNode[]}
                afterSubmitButtons={importDocButton ? [importDocButton] : []}
                submitBtnText="Save Document"
              >
                <Box className="document-body">
                  <Box className="document-fields" sx={{ '--border-color': theme.palette.borderColor }}>
                    {schema.map((entry: any, index: number) => (
                      <Box key={index} className="document-field-row">
                        <DocumentEntry
                          id={`variable-${entry['_index']}`}
                          variableSchema={entry}
                          readOnly={isProduction}
                          variableEntryState={
                            isNew
                              ? [emptyDocumentData, (updOrFn) => {
                                  const v = typeof updOrFn === 'function' ? updOrFn(emptyDocumentData) : updOrFn;
                                  setEmptyDocumentData(v);
                                  return v;
                                }]
                              : [documentData, (updOrFn) => {
                                  setDocumentData(prev => {
                                    const v = typeof updOrFn === 'function' ? updOrFn(prev) : updOrFn;
                                    const changed = Object.keys(prev).reduce((acc: Record<string, any>, key) => {
                                      const val = (v as Record<string, any>)[key];
                                      if (prev[key] !== val) acc[key] = val;
                                      return acc;
                                    }, {});
                                    setUpdatedDocumentDetails(upd => ({ ...upd, ...changed }));
                                    return v as Record<string, any>;
                                  });
                                  return updOrFn;
                                }]
                          }
                          schemaDetails={schemaDetails}
                          onImmediateSave={!isNew ? onImmediateSave : undefined}
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>
              </PageForm>
          </Box>
        )
      ) : (
        <Box className="document-error">
          <Typography component="p">{error}</Typography>
        </Box>
      )}

      {/* Version history drawer */}
      <Drawer anchor="right" open={historyOpen} onClose={() => setHistoryOpen(false)}
        PaperProps={{ sx: { width: 320, p: 0 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={700}>Version History</Typography>
          <IconButton size="small" onClick={() => setHistoryOpen(false)}>
            <X className="h-4 w-4" />
          </IconButton>
        </Box>

        {versions.length === 0 ? (
          <Box sx={{ px: 2.5, py: 3 }}>
            <Typography variant="body2" color="text.secondary">No versions saved yet. Versions are created each time you save.</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {versions.map((v, i) => (
              <ListItem key={v.id} disablePadding divider>
                <ListItemButton
                  onClick={() => handleRestore(v.id)}
                  disabled={i === 0}
                  sx={{ px: 2.5, py: 1.5, flexDirection: 'column', alignItems: 'flex-start' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Typography variant="body2" fontWeight={600}>
                      {i === 0 ? 'Current version' : `Version ${v.version_number}`}
                    </Typography>
                    {i !== 0 && (
                      <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                        Restore
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">{formatDate(v.created_at)}</Typography>
                  {v.created_by_email && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>
                      {v.created_by_email}
                    </Typography>
                  )}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Drawer>

      {/* Import document */}
      <Dialog open={importDocOpen} onClose={() => { setImportDocOpen(false); setImportDocError(''); }} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          Import Document from JSON
          <IconButton size="small" onClick={() => { setImportDocOpen(false); setImportDocError(''); }}>
            <X className="h-4 w-4" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a <code>.json</code> file exported from another document. Only fields matching this document's schema will be imported.
          </Typography>
          <input
            ref={importDocFileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleImportDocument(file);
            }}
          />
          <Box
            onClick={() => importDocFileRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: importDocError ? 'error.main' : 'divider',
              borderRadius: 2, px: 3, py: 4, cursor: 'pointer', textAlign: 'center',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            <Upload className="h-6 w-6" style={{ opacity: 0.4, margin: '0 auto 8px' }} />
            <Typography variant="body2" color="text.secondary">Click to select a JSON file</Typography>
          </Box>
          {importDocError && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{importDocError}</Typography>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="secondary" onClick={() => { setImportDocOpen(false); setImportDocError(''); }}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Delete document?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete <strong>{getDocumentId(document_id ?? '')}</strong>. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
