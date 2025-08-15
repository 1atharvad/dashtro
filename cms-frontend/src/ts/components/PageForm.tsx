import { Box, Button, Grid, Typography, useTheme } from "@mui/material";
import { Dispatch, FormEvent, ReactNode, SetStateAction, useRef, KeyboardEvent } from "react";

export const PageForm = ({
  formType,
  formTitle,
  pageNavigation,
  MenuIcon,
  submitBtnText,
  onSubmit,
  setOpenedPanel,
  extraButtons,
  children
}: {
  formType: string,
  formTitle: string,
  pageNavigation?: ReactNode,
  MenuIcon?: () => JSX.Element,
  submitBtnText: string,
  onSubmit: (event: FormEvent) => void,
  setOpenedPanel?: Dispatch<SetStateAction<string[]>>
  extraButtons?: (() => JSX.Element)[]
  children: ReactNode
}) => {
  const theme = useTheme();
  const formRef = useRef<HTMLFormElement>(null);

  const handleValidation = () => {
    const invalidInput = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(":invalid");

    if (invalidInput && invalidInput.length > 0 && setOpenedPanel instanceof Function) {
      setOpenedPanel(Array.from(invalidInput).map(input => {
        const id = input.id;
        return id.replace(input.name, '');
      }));
    }
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };
  
  return (
    <Box
        ref={formRef}
        component="form"
        onKeyDown={handleKeyDown}
        onSubmit={onSubmit}
        className={`${formType}-component`}>
      <Grid container columnSpacing={2} className={`${formType}-component-title-bar`}>
        <Grid container spacing={0} className={`${formType}-component-title-wrapper`}>
          {MenuIcon && <Grid><MenuIcon/></Grid>}
          <Grid>
            {pageNavigation && <Typography
                component="p" noWrap
                className={`${formType}-component-nav-string`}
                sx={{color: `rgba(${theme.palette.modeComplementColor}, 0.6)`}}>
              {pageNavigation}
            </Typography>}
            <Typography component="h2" noWrap className={`${formType}-component-title`}>
              {formTitle}
            </Typography>
          </Grid>
        </Grid>
        <Grid container columnSpacing={extraButtons ? 2 : 0}>
          {extraButtons && extraButtons.map((Btn, index) => <Grid key={`button-${index}`}><Btn/></Grid>)}
          <Grid>
            <Button type="submit" variant="contained" color="success" onClick={handleValidation}>
              {submitBtnText}
            </Button>
          </Grid>
        </Grid>
      </Grid>
      {children}
    </Box>
  );
}

export const PageWrapper = ({
  wrapperType,
  wrapperTitle,
  MenuIcon,
  extraButtons,
  children
}: {
  wrapperType: string,
  wrapperTitle: string,
  MenuIcon: () => JSX.Element,
  extraButtons?: (() => JSX.Element)[]
  children: ReactNode
}) => {
  return (
    <Box className='collection-component'>
      <Grid container columnSpacing={2} className={`${wrapperType}-component-title-bar`}>
        <Grid container spacing={0} className={`${wrapperType}-component-title-wrapper`}>
        <Grid><MenuIcon/></Grid>
          <Grid>
            <Typography component="h2" noWrap className={`${wrapperType}-component-title`}>
              {wrapperTitle}
            </Typography>
          </Grid>
        </Grid>
        <Grid container columnSpacing={extraButtons && extraButtons.length > 0 ? 2 : 0}>
          {extraButtons && extraButtons.map((Btn, index) => <Grid key={`button-${index}`}><Btn/></Grid>)}
        </Grid>
      </Grid>
      {children}
    </Box>
  );
}