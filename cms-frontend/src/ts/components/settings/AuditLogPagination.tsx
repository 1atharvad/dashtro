import { Box, Typography } from '@mui/material';
import { Button } from 'advi-ui';

export const AuditLogPagination = ({
  total,
  page,
  totalPages,
  loading,
  onPrev,
  onNext,
}: {
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) => {
  if (total === 0) return null;

  return (
    <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">
        {total} total {total === 1 ? 'entry' : 'entries'}
        {totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ''}
      </Typography>
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="secondary" onClick={onPrev} disabled={page === 0 || loading}>
            Previous
          </Button>
          <Button variant="secondary" onClick={onNext} disabled={page >= totalPages - 1 || loading}>
            Next
          </Button>
        </Box>
      )}
    </Box>
  );
};
