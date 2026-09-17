import { IconButton } from '@mui/material';
import { Menu as AdviMenu } from 'advi-ui';
import { CloudDownload, CloudUpload, Download, History, MoreVertical, Save, Trash2, Upload } from 'lucide-react';

export const DocumentActionsMenu = ({
  onSave,
  outOfSync,
  notInProduction,
  onImport,
  onPush,
  onPull,
  onOpenHistory,
  onDownload,
  onDelete,
}: {
  onSave?: () => void;
  outOfSync?: boolean;
  notInProduction?: boolean;
  onImport?: () => void;
  onPush?: () => void;
  onPull?: () => void;
  onOpenHistory?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
}) => (
  <AdviMenu
    align="end"
    contentClassName="cms-actions-menu"
    trigger={
      <IconButton size="small">
        <MoreVertical className="h-4 w-4" />
      </IconButton>
    }
    items={[
      ...(onSave ? [
        { value: 'save', label: 'Save Document', icon: <Save className="h-4 w-4" />, onSelect: onSave },
        ...(onImport || onPush || onPull || onOpenHistory || onDownload || onDelete
          ? [{ type: 'separator' as const, value: 'sep-save' }]
          : []),
      ] : []),
      ...(onImport ? [
        { value: 'import', label: 'Import from JSON', icon: <Upload className="h-4 w-4" />, onSelect: onImport },
        ...(onPush || onPull || onOpenHistory || onDownload || onDelete
          ? [{ type: 'separator' as const, value: 'sep-import' }]
          : []),
      ] : []),
      ...(onPush ? [{
        value: 'push',
        label: outOfSync ? 'Push to production' : 'Already matches production',
        icon: <CloudUpload className="h-4 w-4" />,
        disabled: !outOfSync,
        onSelect: onPush,
      }] : []),
      ...(onPull ? [{
        value: 'pull',
        label: notInProduction ? 'Not in production yet' : 'Pull from production',
        icon: <CloudDownload className="h-4 w-4" />,
        disabled: !!notInProduction || !outOfSync,
        onSelect: onPull,
      }] : []),
      ...(onPush || onPull ? [{ type: 'separator' as const, value: 'sep-1' }] : []),
      ...(onOpenHistory ? [{
        value: 'history',
        label: 'Version history',
        icon: <History className="h-4 w-4" />,
        onSelect: onOpenHistory,
      }] : []),
      ...(onDownload ? [{
        value: 'download',
        label: 'Download',
        icon: <Download className="h-4 w-4" />,
        onSelect: onDownload,
      }] : []),
      ...(onOpenHistory || onDownload ? [{ type: 'separator' as const, value: 'sep-2' }] : []),
      ...(onDelete ? [{
        value: 'delete',
        label: 'Delete document',
        icon: <Trash2 className="h-4 w-4" />,
        destructive: true,
        onSelect: onDelete,
      }] : []),
    ]}
  />
);
