import { useEffect, useState } from 'react';
import {
  Box, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Table, TableBody, TableCell, TableHead, TableRow,
  Typography, CircularProgress,
} from '@mui/material';
import { X } from 'lucide-react';
import { Button, toast } from 'advi-ui';
import { useWorkspaceData } from '@/hooks/useWorkspace';
import type { WorkspaceDiff, WorkspaceDiffModifiedDoc } from '@ts/types/constants';

type SyncMode = 'push' | 'pull';

export const WorkspaceSyncModal = ({
  projectId,
  open,
  workspaceName,
  mode,
  onClose,
  collectionId,
  collectionName,
  onPush,
  onPull,
}: {
  projectId: string;
  open: boolean;
  workspaceName: string | null;
  mode: SyncMode;
  onClose: () => void;
  // When set, the modal is scoped to a single collection: the diff is filtered
  // to that collection and confirm delegates to onPush/onPull instead of the
  // workspace-level actions (the callbacks own their own success/error toasts).
  collectionId?: string;
  collectionName?: string;
  onPush?: () => Promise<unknown>;
  onPull?: (resolutions: Record<string, 'production' | 'workspace'>) => Promise<unknown>;
}) => {
  const { fetchDiff, pushWorkspaceToProd, pullWorkspaceFromProd } = useWorkspaceData(projectId);
  const scoped = !!collectionId;

  const [diff, setDiff] = useState<WorkspaceDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, 'production' | 'workspace'>>({});

  useEffect(() => {
    if (!open || !workspaceName) return;
    setDiff(null);
    setResolutions({});
    setDiffLoading(true);
    fetchDiff(workspaceName)
      .then((full: WorkspaceDiff) => {
        const result: WorkspaceDiff = collectionId
          ? (collectionId in full ? { [collectionId]: full[collectionId] } : {})
          : full;
        setDiff(result);
        const defaults: Record<string, 'production' | 'workspace'> = {};
        Object.entries(result).forEach(([colId, bucket]) => {
          bucket.modified.forEach((entry: WorkspaceDiffModifiedDoc) => {
            defaults[`${colId}:${entry.document_id}`] = 'production';
          });
        });
        setResolutions(defaults);
      })
      .catch(err => {
        console.error(err);
        toast.error('Failed to compute diff');
      })
      .finally(() => setDiffLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceName]);

  const handleConfirm = async () => {
    if (!workspaceName) return;
    setSubmitting(true);
    try {
      if (scoped) {
        if (mode === 'push') await onPush?.();
        else await onPull?.(resolutions);
      } else if (mode === 'push') {
        await pushWorkspaceToProd(workspaceName);
        toast.success('Pushed to production');
      } else {
        await pullWorkspaceFromProd(workspaceName, resolutions);
        toast.success('Pulled latest from production');
      }
      onClose();
    } catch (err) {
      console.error(err);
      if (!scoped) {
        toast.error(mode === 'push' ? 'Failed to push to production' : 'Failed to pull from production');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const collections = diff ? Object.entries(diff) : [];
  const hasChanges = collections.some(([, bucket]) =>
    bucket.source_only.length || bucket.target_only.length || bucket.modified.length
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {scoped
          ? (mode === 'push' ? `Push "${collectionName}" to production` : `Pull "${collectionName}" from production`)
          : (mode === 'push' ? `Push "${workspaceName}" to production` : `Pull latest from production into "${workspaceName}"`)}
        <IconButton size="small" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {diffLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!diffLoading && diff && !hasChanges && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {scoped
              ? 'No differences found — this collection is already in sync with production.'
              : 'No differences found — this workspace and production are already in sync.'}
          </Typography>
        )}

        {!diffLoading && diff && hasChanges && collections.map(([colId, bucket]) => {
          const addedOrUpdated = mode === 'push'
            ? [
                ...bucket.source_only.map(d => ({ document_id: d.document_id, note: 'new in production' })),
                ...bucket.modified.map(d => ({ document_id: d.document_id, note: `updated (${d.changed_fields.join(', ')})` })),
              ]
            : [
                ...bucket.target_only.map(d => ({ document_id: d.document_id, note: 'will be added' })),
              ];

          const removedFromProd = mode === 'push'
            ? bucket.target_only.map(d => ({ document_id: d.document_id, note: 'removed from production' }))
            : [];

          const conflicts = mode === 'pull' ? bucket.modified : [];
          const unaffected = mode === 'pull' ? bucket.source_only : [];

          if (!addedOrUpdated.length && !removedFromProd.length && !conflicts.length && !unaffected.length) return null;

          return (
            <Box key={colId} sx={{ mb: 3 }}>
              {!scoped && <Typography variant="subtitle2" sx={{ mb: 1 }}>{colId}</Typography>}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Document</TableCell>
                    <TableCell>Status</TableCell>
                    {mode === 'pull' && <TableCell align="right">Keep</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {addedOrUpdated.map(d => (
                    <TableRow key={d.document_id}>
                      <TableCell>{d.document_id}</TableCell>
                      <TableCell><Typography variant="body2" color="success.main">{d.note}</Typography></TableCell>
                      {mode === 'pull' && <TableCell />}
                    </TableRow>
                  ))}
                  {removedFromProd.map(d => (
                    <TableRow key={d.document_id}>
                      <TableCell>{d.document_id}</TableCell>
                      <TableCell><Typography variant="body2" color="error.main">{d.note}</Typography></TableCell>
                    </TableRow>
                  ))}
                  {conflicts.map(entry => {
                    const key = `${colId}:${entry.document_id}`;
                    return (
                      <TableRow key={entry.document_id}>
                        <TableCell>{entry.document_id}</TableCell>
                        <TableCell>
                          <Typography variant="body2" color="warning.main">
                            conflict ({entry.changed_fields.join(', ')})
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Button
                              variant={resolutions[key] === 'production' ? 'default' : 'outline'}
                              className="border-current"
                              onClick={() => setResolutions(prev => ({ ...prev, [key]: 'production' }))}
                            >
                              Production
                            </Button>
                            <Button
                              variant={resolutions[key] === 'workspace' ? 'default' : 'outline'}
                              className="border-current"
                              onClick={() => setResolutions(prev => ({ ...prev, [key]: 'workspace' }))}
                            >
                              Keep mine
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {unaffected.map(d => (
                    <TableRow key={d.document_id}>
                      <TableCell>{d.document_id}</TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">workspace-only, unaffected</Typography></TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          );
        })}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button variant="secondary" className="border-current" onClick={onClose}>Cancel</Button>
        <Button
          variant="default"
          className="border-current"
          onClick={handleConfirm}
          disabled={diffLoading || submitting || !diff}
        >
          {mode === 'push' ? 'Push to production' : 'Pull from production'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
