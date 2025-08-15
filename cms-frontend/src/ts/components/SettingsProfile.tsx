import { useState } from 'react';
import { Avatar, Box, Card, CardContent, Chip, IconButton, Typography } from '@mui/material';
import { PhotoCamera } from '@mui/icons-material';
import Grid from '@mui/material/Grid';

export const SettingsProfile = () => {
  const [username, _] = useState('Atharva Sarvesh Devasthali');

  const name = username.split(' ');

  return (
    <Grid container spacing={3}>
      <Grid size={12}>
        <Card elevation={0}>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Box sx={{ position: 'relative', display: 'inline-block', mb: 2 }}>
              <Avatar
                  sx={{ width: 100, height: 100, mx: 'auto', mb: 2 }}>
                {name[0].charAt(0)}{name[name.length -  1].charAt(0)}
              </Avatar>
              <input
                accept="image/*"
                style={{ display: 'none' }}
                id="avatar-upload"
                type="file"
              />
              <label htmlFor="avatar-upload">
                <IconButton color="primary" component="span"
                    sx={{
                      position: 'absolute',
                      bottom: 8,
                      right: 0,
                      bgcolor: 'background.paper',
                      boxShadow: 1,
                      '&:hover': { bgcolor: 'grey.50' }
                    }}>
                  <PhotoCamera />
                </IconButton>
              </label>
            </Box>
            <Typography variant="h6" fontWeight="medium">
              {username}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {'atharvadevasthali22@gmail.com'}
            </Typography>
            <Chip label={"CMS Administrator"}
                color="primary"
                variant="outlined"
                size="small"/>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}