import { IconButton } from '@mui/material';
import { Menu as AdviMenu } from 'advi-ui';
import { CloudDownload, CloudUpload, Download, History, MoreVertical, Trash2 } from 'lucide-react';

export const DocumentActionsMenu = ({
  outOfSync,
  notInProduction,
  onPush,
  onPull,
  onOpenHistory,
  onDownload,
  onDelete,
}: {
  outOfSync: boolean;
  notInProduction: boolean;
  onPush: () => void;
  onPull: () => void;
  onOpenHistory: () => void;
  onDownload: () => void;
  onDelete: () => void;
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
      {
        value: 'push',
        label: outOfSync ? 'Push to production' : 'Already matches production',
        icon: <CloudUpload className="h-4 w-4" />,
        disabled: !outOfSync,
        onSelect: onPush,
      },
      {
        value: 'pull',
        label: notInProduction ? 'Not in production yet' : 'Pull from production',
        icon: <CloudDownload className="h-4 w-4" />,
        disabled: notInProduction || !outOfSync,
        onSelect: onPull,
      },
      { type: 'separator', value: 'sep-1' },
      {
        value: 'history',
        label: 'Version history',
        icon: <History className="h-4 w-4" />,
        onSelect: onOpenHistory,
      },
      {
        value: 'download',
        label: 'Download',
        icon: <Download className="h-4 w-4" />,
        onSelect: onDownload,
      },
      { type: 'separator', value: 'sep-2' },
      {
        value: 'delete',
        label: 'Delete document',
        icon: <Trash2 className="h-4 w-4" />,
        destructive: true,
        onSelect: onDelete,
      },
    ]}
  />
);
