import React, { Dispatch, FormEvent, SetStateAction, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from "react-router-dom";
import {
  Box, Chip, IconButton, Tooltip, Typography, useTheme,
} from '@mui/material';
import { Button, PageNotFound } from 'advi-ui';
import { Download, Upload } from 'lucide-react';
import '@/scss/DocCollection.scss';
import { useCollectionData } from '@/hooks/useCollection';
import { useSchemaData } from '@/hooks/useSchema';
import { useWorkspaceData } from '@/hooks/useWorkspace';
import { PageForm } from '@ts/components/PageForm';
import { DocumentEntry } from '@ts/components/DocumentEntry';
import { useDocumentData } from '@/hooks/useDocument';
import { useRichTextComponentsQuery } from '@ts/api/richTextComponents';
import { ApiError } from '@ts/api/client';
import { Link } from '@ts/components/Link';
import { AppHeader } from '@ts/components/AppHeader';
import { VersionHistoryDrawer } from '@ts/components/VersionHistoryDrawer';
import { DocumentActionsMenu } from '@ts/components/DocumentActionsMenu';
import { DocumentSkeleton } from '@ts/components/skeletons/DocumentSkeleton';
import { ImportDocumentDialog } from '@ts/components/dialogs/ImportDocumentDialog';
import { DeleteDocumentDialog } from '@ts/components/dialogs/DeleteDocumentDialog';
import { SyncConfirmDialog } from '@ts/components/dialogs/SyncConfirmDialog';
import type { SchemaFieldItem, DocumentData, WorkspaceDiff } from '@ts/types/constants';

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

  const [schema, setSchema] = useState<SchemaFieldItem[]>([]);
  const [emptyDocumentData, setEmptyDocumentData] = useState<DocumentData>({});
  const [documentData, setDocumentData] = useState<DocumentData>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState<'push' | 'pull' | null>(null);
  const [importDocOpen, setImportDocOpen] = useState(false);

  // RichTextModal (mounted per-field, only once the whole form below is
  // ready) fetches this same query lazily on its own — firing it here too,
  // in parallel with the document/schema fetches, means React Query's cache
  // (deduped by query key) is already warm by the time any RichText field
  // mounts, instead of that fetch only starting after everything else has
  // already rendered.
  useRichTextComponentsQuery(project_id ?? '');

  const { collections } = useCollectionData(project_id ?? '');
  const schemaName = collections.reduce((prev, curr) =>
    curr['_collection_name'] === collection_name ? curr['_schema_name'] : prev, '');
  const collectionId = collections.find(c => c._collection_name === collection_name)?._id;

  const { schemaDetails, loading: loading1 } = useSchemaData(project_id ?? '', schemaName);
  const { fetchDiff, getCachedDiff } = useWorkspaceData(project_id ?? '');
  const cachedDiff = workspace_name ? getCachedDiff(workspace_name) : undefined;
  const [diff, setDiff] = useState<WorkspaceDiff | null>(cachedDiff ?? null);
  const [diffLoaded, setDiffLoaded] = useState(!!cachedDiff);
  const {
    collDocumentContent,
    defaultId,
    addDocumentData,
    updateDocumentData,
    deleteDocumentData,
    pushDocumentData,
    pullDocumentData,
    fetchVersions,
    restoreVersion,
    versions,
    loading: loading2,
    error: fetchError,
  } = useDocumentData(project_id ?? '', collection_name ?? '', workspace_name ?? 'production', document_id);

  const isProduction = workspace_name === 'production';
  const isNew = document_id === defaultId;
  const [error, setError] = useState('');
  const [updatedDocumentDetails, setUpdatedDocumentDetails] = useState<DocumentData>({});
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

  const modifiedEntry = (collectionId && document_id)
    ? diff?.[collectionId]?.modified.find(d => d.document_id === document_id)
    : undefined;
  const notInProduction = !!(collectionId && document_id &&
    diff?.[collectionId]?.source_only.some(d => d.document_id === document_id));
  const outOfSync = !!modifiedEntry || notInProduction;
  const currentStatus: 'draft' | 'published' | null =
    isProduction ? 'published' : !diffLoaded ? null : outOfSync ? 'draft' : 'published';

  const refreshDiff = () => {
    if (isProduction || !workspace_name) { setDiff(null); setDiffLoaded(true); return; }
    setDiffLoaded(false);
    fetchDiff(workspace_name)
      .then(setDiff)
      .catch(err => console.error(err))
      .finally(() => setDiffLoaded(true));
  };

  useEffect(() => {
    refreshDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace_name, collection_name]);

  useEffect(() => {
    loadedDocumentIdRef.current = null;
    hasLoadedRef.current = false;
    setDocumentData({});
    setUpdatedDocumentDetails({});
  }, [document_id]);

  useEffect(() => {
    if (!loading && collection_name && !isNew && document_id &&
        document_id !== loadedDocumentIdRef.current &&
        collection_name in collDocumentContent &&
        document_id in collDocumentContent[collection_name]) {
      const content = collDocumentContent[collection_name][document_id];
      if ('error' in content) {
        setError(String(content['error']));
      } else {
        setDocumentData(content);
        loadedDocumentIdRef.current = document_id;
      }
    }
  }, [loading, collection_name, document_id, collDocumentContent, isNew]);

  const createEmptyDocumentData = useCallback((details: Record<string, SchemaFieldItem[]>, name: string, depth = 0): DocumentData => {
    const data = details[name];
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
    }, {} as DocumentData);
  }, [maxDepth]);

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
  }, [loading, schemaDetails, schemaName, createEmptyDocumentData]);

  const displayNameField = schema.find(f => f._display_name)?._name;
  const displayLabel: string = isNew
    ? 'New Document'
    : String((displayNameField ? (documentData[displayNameField] || document_id) : document_id) ?? '');

  const getDocumentId = (id: string, isTitle = false) => {
    const label = id === defaultId ? 'New Document' : id;
    return !isTitle ? label.replace(/\s+/g, '') : label;
  };

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
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

  // Ref so onImmediateSave stays stable across renders even though
  // updateDocumentData is recreated on every render by the hook.
  const updateDocumentDataRef = useRef(updateDocumentData);
  updateDocumentDataRef.current = updateDocumentData;

  const onImmediateSave = useCallback((fieldName: string, val: unknown) => {
    if (isProduction) return;
    updateDocumentDataRef.current({ [fieldName]: val });
  }, [isProduction]);

  const handleOpenHistory = () => {
    if (document_id && !isNew) {
      fetchVersions(document_id);
      setHistoryOpen(true);
    }
  };

  const statusBadge = ((!isNew && !isProduction) || (isProduction && currentDoc)) && currentStatus ? (
    <Tooltip title={currentStatus === 'published' ? 'Matches production' : 'Differs from production'}>
      <Chip
        label={
          <>
            <span className="hidden md:inline">{currentStatus === 'published' ? 'Published' : 'Draft'}</span>
            <span className="md:hidden">{currentStatus === 'published' ? 'P' : 'D'}</span>
          </>
        }
        color={currentStatus === 'published' ? 'success' : 'default'}
        size="small"
        sx={{ fontWeight: 600, height: 24 }}
      />
    </Tooltip>
  ) : null;

  const existingDocActionProps = !isNew ? {
    outOfSync,
    notInProduction,
    onPush: () => setSyncConfirm('push'),
    onPull: () => setSyncConfirm('pull'),
    onOpenHistory: handleOpenHistory,
    onDownload: () => handleExportDocument(),
    onDelete: () => setDeleteOpen(true),
  } : {};

  // Desktop keeps the existing layout: a standalone Save button plus this
  // menu only for existing (non-new) documents. Mobile folds Save into the
  // same dropdown so it's reachable even for a brand-new document, which
  // otherwise has no menu here at all.
  const desktopActionsButton = !isNew && !isProduction ? (
    <span className="hidden md:inline-flex">
      <DocumentActionsMenu {...existingDocActionProps} />
    </span>
  ) : null;

  const mobileActionsButton = !isProduction ? (
    <span className="md:hidden">
      <DocumentActionsMenu
        onSave={() => handleSubmit()}
        onImport={isNew ? () => setImportDocOpen(true) : undefined}
        {...existingDocActionProps}
      />
    </span>
  ) : null;

  // Production is read-only: no push/pull/history/delete, but export is still allowed.
  const downloadButton = !isNew && isProduction ? (
    <Tooltip title="Download document">
      <IconButton size="small" onClick={() => handleExportDocument()}>
        <Download className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  ) : null;

  const handleDocumentSynced = (pulling: boolean) => {
    if (pulling) {
      // Let the document-load effect re-read the pulled content from redux
      loadedDocumentIdRef.current = null;
      setUpdatedDocumentDetails({});
    }
    refreshDiff();
  };

  const handleDocumentDeleted = () => {
    navigate(`/projects/${project_id}/workspace/${workspace_name}/collection/${collection_name}/`);
  };

  const handleExportDocument = () => {
    const defaults = schema.reduce((acc: DocumentData, field) => {
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

  const importDocButton = isNew && !isProduction ? (
    <span className="hidden md:inline-flex">
      <Button key="import-doc" variant="secondary" onClick={() => setImportDocOpen(true)}>
        <Upload className="h-4 w-4" /> Import from JSON
      </Button>
    </span>
  ) : null;

  // For a new document, edits write straight into emptyDocumentData. For an
  // existing one, edits go through documentData and also accumulate a diff
  // (updatedDocumentDetails) so handleSubmit only PATCHes changed fields.
  const getVariableEntryState = (): [DocumentData, Dispatch<SetStateAction<DocumentData>>] =>
    isNew
      ? [emptyDocumentData, (updOrFn) => {
          const v = typeof updOrFn === 'function' ? updOrFn(emptyDocumentData) : updOrFn;
          setEmptyDocumentData(v);
          return v;
        }]
      : [documentData, (updOrFn) => {
          setDocumentData(prev => {
            const v = typeof updOrFn === 'function' ? updOrFn(prev) : updOrFn;
            const changed = Object.keys(prev).reduce((acc: DocumentData, key) => {
              const val = v[key];
              if (prev[key] !== val) acc[key] = val;
              return acc;
            }, {});
            setUpdatedDocumentDetails(upd => ({ ...upd, ...changed }));
            return v;
          });
          return updOrFn;
        }];

  if (!isNew && fetchError instanceof ApiError && fetchError.status === 404) {
    return <PageNotFound />;
  }

  return (
    <>
      <AppHeader />
      {error === '' ? (
        isReady ? (
          <Box className="document">
            <PageForm
                formType="document"
                onSubmit={handleSubmit}
                readOnly={isProduction}
                formTitle={displayLabel}
                titleBadge={statusBadge}
                pageNavigation={
                  <PageNavigation
                    projectId={project_id ?? ''}
                    workspaceName={workspace_name ?? 'production'}
                    collectionName={collection_name ?? ''}
                    documentId={displayLabel}
                  />
                }
                afterSubmitButtons={[desktopActionsButton, mobileActionsButton, downloadButton, importDocButton].filter(Boolean) as React.ReactNode[]}
                submitBtnText="Save Document"
                hideSubmitOnMobile
              >
                <Box className="document-body">
                  <Box className="document-fields" sx={{ '--border-color': theme.palette.borderColor }}>
                    {schema.map((entry, index: number) => (
                      <Box key={index} className="document-field-row">
                        <DocumentEntry
                          id={`variable-${entry['_index']}`}
                          variableSchema={entry}
                          readOnly={isProduction}
                          variableEntryState={getVariableEntryState()}
                          schemaDetails={schemaDetails}
                          onImmediateSave={!isNew ? onImmediateSave : undefined}
                          excludeValues={!isNew && document_id ? [document_id] : []}
                        />
                      </Box>
                    ))}
                  </Box>
                </Box>
              </PageForm>
          </Box>
        ) : (
          <DocumentSkeleton />
        )
      ) : (
        <Box className="document-error">
          <Typography component="p">{error}</Typography>
        </Box>
      )}

      <VersionHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        versions={versions}
        documentId={document_id}
        restoreVersion={restoreVersion}
      />

      <ImportDocumentDialog
        open={importDocOpen}
        onClose={() => setImportDocOpen(false)}
        schemaFieldNames={schema.map((f) => f._name)}
        onImport={(data) => setEmptyDocumentData(prev => ({ ...prev, ...data }))}
      />

      <DeleteDocumentDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        documentLabel={getDocumentId(document_id ?? '')}
        documentId={document_id}
        deleteDocumentData={deleteDocumentData}
        onDeleted={handleDocumentDeleted}
      />

      <SyncConfirmDialog
        mode={syncConfirm}
        onClose={() => setSyncConfirm(null)}
        documentLabel={getDocumentId(document_id ?? '')}
        changedFields={modifiedEntry?.changed_fields}
        documentId={document_id}
        pullDocumentData={pullDocumentData}
        pushDocumentData={pushDocumentData}
        onSynced={handleDocumentSynced}
      />
    </>
  );
};
