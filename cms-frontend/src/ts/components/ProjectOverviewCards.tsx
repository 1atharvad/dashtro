import { Box, Card, CardContent, Chip, Grid, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ArrowRight, Database, Settings } from 'lucide-react';
import { Button, Carousel } from 'advi-ui';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@ts/api/projects';

export const ProjectOverviewCards = ({ projectId, project }: { projectId: string; project: Project }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const productionCard = (
    <Card className="pp-card pp-card--production" elevation={0}>
      <CardContent className="pp-card-content">
        <Box className="pp-card-header">
          <Chip label="Production" size="small" color="success" />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 2, flex: 1 }}>
          The live workspace connected to your website. Push from any workspace to update it.
        </Typography>
        <Button variant="secondary"
          onClick={() => navigate(`/projects/${projectId}/workspace/production/`)}>
          View Production <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );

  const rtdbCard = (
    <Card className="pp-card" elevation={0}>
      <CardContent className="pp-card-content">
        <Box className="pp-card-header">
          <Typography variant="overline" color="text.secondary" lineHeight={1}>
            Realtime Database
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 2, flex: 1 }}>
          A live JSON data store for this project, synced instantly across every connected client.
        </Typography>
        <Button variant="secondary"
          onClick={() => navigate(`/projects/${projectId}/rtdb/`)}>
          <Database className="h-4 w-4" /> Open Realtime Database
        </Button>
      </CardContent>
    </Card>
  );

  const infoCard = (
    <Card className="pp-card" elevation={0}>
      <CardContent className="pp-card-content">
        <Box className="pp-card-header">
          <Typography variant="overline" color="text.secondary" lineHeight={1}>
            Project Info
          </Typography>
          <Tooltip title="Project settings">
            <IconButton size="small" sx={{ p: 1 }} onClick={() => navigate(`/projects/${projectId}/settings/identity/`)}>
              <Settings className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body1" fontWeight={600}>{project.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {project.description || 'No description.'}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
            Created {new Date(project.created_at).toLocaleDateString()}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );

  const cards = [productionCard, rtdbCard, infoCard];

  if (isMobile) {
    return (
      <Box className="project-page-cards-carousel">
        <Carousel showDots showArrows={false}>
          {cards}
        </Carousel>
      </Box>
    );
  }

  return (
    <Grid container spacing={3} className="project-page-cards">
      {cards.map((card, index) => (
        <Grid size={{ xs: 12, md: 4 }} key={index}>{card}</Grid>
      ))}
    </Grid>
  );
};
