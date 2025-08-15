import { MouseEvent } from "react";
import { Box, Button, Divider, IconButton, Typography, Grid, Paper } from "@mui/material";
import { NavigateNext as NavigateNextIcon, DragIndicator as DragIndicatorIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { Link as BrowserLink } from "react-router-dom";
import { PageWrapper } from "@ts/components/PageForm";
import { useDocumentData } from "@/hooks/useDocument";
import { RootState } from '@/redux/store';
import { useSelector } from "react-redux";

export const DocumentList = ({
  workspaceName,
  collectionName,
  schemaName,
  MenuIcon
}: {
  workspaceName: string,
  collectionName: string,
  schemaName: string
  MenuIcon: () => JSX.Element
}) => {
  const {
    collDocumentIds,
    deleteDocumentData,
    loading
  } = useDocumentData(collectionName);

  const LinkToSchemaBtn = () => (
    <Button
        variant="contained"
        color="warning"
        component={BrowserLink}
        to={`/schema/${schemaName}/`}>
      Schema
    </Button>
  );
  const NewDocumentBtn = () => (
    <Button
        variant="contained"
        color="success"
        component={BrowserLink}
        to={`/workspace/${workspaceName}/collection/${collectionName}/document/new/`}>
      New Document
    </Button>
  );

  return (
    <PageWrapper
        wrapperType='collection'
        wrapperTitle={collectionName}
        MenuIcon={MenuIcon}
        extraButtons={
          collDocumentIds[collectionName] && collDocumentIds[collectionName].length > 0
            ? [LinkToSchemaBtn, NewDocumentBtn]
            : [LinkToSchemaBtn]
        }>
      <Paper className='collection-document-container'>
        {!loading && collDocumentIds[collectionName] && (
          collDocumentIds[collectionName].length > 0 ? collDocumentIds[collectionName].map((id, index) => (
            <Box key={`document-${index}`}>
              <Button className='collection-document' component={BrowserLink}
                  to={`/workspace/${workspaceName}/collection/${collectionName}/document/${id}/`}>
                <Grid container className='document-container'>
                  <Grid container columnSpacing={1} className='document-title'>
                    <Grid><DragIndicatorIcon className="drag-icon"/></Grid>
                    <Grid><Typography component='h3'>{id}</Typography></Grid>
                  </Grid>
                  <Grid container columnSpacing={3} className='document-icon-bar'>
                    <Grid>
                      <IconButton className="delete-btn" onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.preventDefault();
                        deleteDocumentData(id);
                      }}>
                        <DeleteIcon/>
                      </IconButton>
                    </Grid>
                    <Grid><NavigateNextIcon className="navigation-icon"/></Grid>
                  </Grid>
                </Grid>
              </Button>
              <Divider/>
            </Box>
          )) : (
            <Box className='empty-container'>
              <Typography component='h3'>No documents currently added, create a new document.</Typography>
              <NewDocumentBtn/>
            </Box>
          )
        )}
      </Paper>
    </PageWrapper>
  );
}