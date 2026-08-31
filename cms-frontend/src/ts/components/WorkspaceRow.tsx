import { Box, IconButton, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Menu as AdviMenu } from 'advi-ui';
import { MoreVertical } from 'lucide-react';
import type { Workspace } from '@ts/api/workspaces';

export const WorkspaceRow = ({
  workspace,
  projectId,
  onPush,
  onPull,
  onArchive,
}: {
  workspace: Workspace;
  projectId: string;
  onPush: () => void;
  onPull: () => void;
  onArchive: () => void;
}) => (
  <Box className="workspace-row">
    <RouterLink
      to={`/projects/${projectId}/workspace/${workspace.workspace_name}/`}
      className="workspace-row-link"
    >
      <Typography variant="body1" fontWeight={600} className="workspace-row-name">
        {workspace.workspace_name}
      </Typography>
      <Typography variant="caption" color="text.disabled">
        Created {new Date(workspace.created_at).toLocaleDateString()}
      </Typography>
    </RouterLink>
    <AdviMenu
      align="end"
      contentClassName="cms-actions-menu"
      trigger={
        <IconButton
          size="small"
          className="workspace-row-menu-btn"
          onClick={e => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </IconButton>
      }
      items={[
        { value: 'push', label: 'Push to production', onSelect: onPush },
        { value: 'pull', label: 'Pull latest from production', onSelect: onPull },
        { type: 'separator', value: 'sep' },
        { value: 'archive', label: 'Archive workspace', destructive: true, onSelect: onArchive },
      ]}
    />
  </Box>
);
