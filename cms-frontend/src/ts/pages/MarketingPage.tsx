import { Box, Typography } from '@mui/material';
import { Button } from 'advi-ui';
import { useNavigate } from 'react-router-dom';
import '@/scss/MarketingPage.scss';

export const MarketingPage = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center', p: 4 }}>
      <Typography className="marketing-title" variant="h3" fontWeight={700} gutterBottom>DashTro</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        The headless CMS built for speed and flexibility.
      </Typography>
      <Button variant="default" onClick={() => navigate('/projects/')}>
        Go to Dashboard
      </Button>
    </Box>
  );
};
