import { useEffect, useRef, useState } from 'react';
import { useParams, Link as BrowserLink } from "react-router-dom";
import { Box, Button, Divider, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import { Schema as SchemaIcon } from '@mui/icons-material';

import { SchemaComponent } from "@ts/components/SchemaComponent";
import { CollectionComponent } from '@ts/components/CollectionComponent';
import { LinkDrawer } from '@ts/components/LinkDrawer';
import { HamburgerMenu } from '@ts/components/HamburgerMenu';

import { useSchemaMetaData } from "@/hooks/useSchemaMetaData";

import '@/scss/Schema.scss';

export const Schema = () => {
  const {schemaNames, loading} = useSchemaMetaData();
  const [currentSchemaName, setCurrentSchemaName] = useState<string>('');
  const {schema_name} = useParams();
  const drawerRef = useRef<{ handleDrawerToggle: () => void }>(null);

  useEffect(() => {
    setCurrentSchemaName(schema_name || '');
  }, [schema_name]);

  return (
    <>
      {!loading && <Box className='schema'>
        <LinkDrawer className='schema-drawer' LinkList={() => (
          <Box className='schema-list'>
            <Divider/>
            <Button
                component={BrowserLink}
                to='/schema/'
                className='schema-list-title-link'
                startIcon={<SchemaIcon />}>
              <Typography className='schema-list-title' component="h2">Schema</Typography>
            </Button>
            <Divider/>
            <Box component="nav" aria-label="schema names">
              <List>
                {schemaNames.map((schemaName, index: number) => (
                  <ListItem key={`schema-name-${index}`} disablePadding>
                    <ListItemButton component={BrowserLink} to={`/schema/${schemaName}/`} selected={schemaName === currentSchemaName}>
                      <ListItemText primary={schemaName}/>
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          </Box>
        )} ref={drawerRef}/>
        <Box className='schema-content'>
          {currentSchemaName ? (
            <SchemaComponent componentName={currentSchemaName} newSchema={!schemaNames.includes(currentSchemaName)} MenuIcon={() => (
              <HamburgerMenu
                  className='schema-view-hamburger-menu'
                  handleDrawerToggle={drawerRef.current?.handleDrawerToggle || (() => {})}/>
            )}/>
          ) : (
            <CollectionComponent MenuIcon={() => (
              <HamburgerMenu
                  className='schema-view-hamburger-menu'
                  handleDrawerToggle={drawerRef.current?.handleDrawerToggle || (() => {})}/>
            )}/>
          )}
        </Box>
      </Box>}
    </>
  )
}