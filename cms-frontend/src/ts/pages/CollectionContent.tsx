import { useEffect, useRef, useState } from 'react';
import { useParams, Link as BrowserLink } from "react-router-dom";
import { Box, Button, Divider, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import { LibraryBooks as LibraryBooksIcon } from '@mui/icons-material';

import { DocumentList } from '@ts/components/DocumentList';
import { HamburgerMenu } from '@ts/components/HamburgerMenu';
import { LinkDrawer } from '@ts/components/LinkDrawer';

import { useCollectionData } from '@/hooks/useCollection';

import '@/scss/DocCollection.scss';

export const CollectionContent = () => {
  const {workspace_name, collection_name} = useParams();
  const {collections, loading} = useCollectionData();
  const [currentCollectionName, setCurrentCollectionName] = useState<string>('');
  const [currentSchemaName, setCurrentSchemaName] = useState<string>('');
  const [currentWorkspaceName, setCurrentWorkspaceName] = useState<string>('');
  const drawerRef = useRef<{ handleDrawerToggle: () => void }>(null);

  useEffect(() => {
    if (!loading) {
      setCurrentCollectionName(collection_name || '');
      setCurrentWorkspaceName(workspace_name || '');
      setCurrentSchemaName(collections.reduce((prevVal, currVal) => {
        return currVal['_collection_name'] === collection_name ? currVal['_schema_name'] : prevVal;
      }, ''));
    }
  }, [workspace_name, collection_name, collections, loading]);

  return (
    <>
      {!loading && <Box className='collection'>
        <LinkDrawer className='collection-drawer' LinkList={() => (
          <Box className='collection-list'>
            <Divider/>
            <Button
                className='collection-list-title-link'
                startIcon={<LibraryBooksIcon />}
                disabled>
              <Typography className='collection-list-title' component="h2">Collections</Typography>
            </Button>
            <Divider/>
            <Box component="nav" aria-label="collection names">
              <List>
                {collections.map((collection, index: number) => {
                  const collectionName = collection['_collection_name'] as string;

                  return (
                    <ListItem key={`collection-name-${index}`} disablePadding>
                      <ListItemButton component={BrowserLink} to={`/workspace/${currentWorkspaceName}/collection/${collectionName}/`} selected={collectionName === currentCollectionName}>
                        <ListItemText primary={collectionName}/>
                      </ListItemButton>
                    </ListItem>
                  )
                })}
              </List>
            </Box>
          </Box>
        )} ref={drawerRef}/>
        <Box className='collection-content'>
          {currentCollectionName ? (
            <DocumentList
                workspaceName={currentWorkspaceName}
                collectionName={currentCollectionName}
                schemaName={currentSchemaName}
                MenuIcon={() => (
                  <HamburgerMenu
                      className='collection-view-hamburger-menu'
                      handleDrawerToggle={drawerRef.current?.handleDrawerToggle || (() => {})}/>
                )
            }/>
          ) : (
            <></>
          )}
        </Box>
      </Box>}
    </>
  )
}