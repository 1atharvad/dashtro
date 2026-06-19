import { Box, Button, Chip, Divider, Typography } from '@mui/material';
import { Webhook, GitBranch, Cloud } from 'lucide-react';
import { Card, CardContent } from 'advi-ui';

const integrations = [
  { icon: <Webhook className="h-4 w-4" />, name: 'Webhooks', description: 'Send HTTP callbacks when content changes.' },
  { icon: <GitBranch className="h-4 w-4" />, name: 'GitHub Actions', description: 'Trigger CI/CD pipelines on publish.' },
  { icon: <Cloud className="h-4 w-4" />, name: 'CDN Purge', description: 'Automatically purge CDN cache on updates.' },
];

export const SettingsIntegrations = () => (
  <Card>
    <CardContent style={{ padding: '1.5rem' }}>
      <Typography variant="subtitle1" fontWeight={700}>Integrations</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Connect your CMS with external services</Typography>
      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {integrations.map((item, i) => (
          <Box
            key={item.name}
            sx={{
              display: 'flex', alignItems: 'center', gap: 2, py: 1.75,
              borderBottom: i < integrations.length - 1 ? '1px solid' : 'none',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 2, bgcolor: 'action.hover', flexShrink: 0, opacity: 0.7 }}>
              {item.icon}
            </Box>
            <Box flex={1}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                <Chip label="coming soon" size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 18 }} />
              </Box>
              <Typography variant="body2" color="text.secondary">{item.description}</Typography>
            </Box>
            <Button variant="outlined" size="small" disabled>Configure</Button>
          </Box>
        ))}
      </Box>
    </CardContent>
  </Card>
);
