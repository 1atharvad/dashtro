import { Box, Grid, Typography, useTheme } from "@mui/material";
import { Button } from 'advi-ui';
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
  afterSubmitButtons,
  titleBadge,
  readOnly,
  children
}: {
  formType: string,
  formTitle: string,
  pageNavigation?: ReactNode,
  MenuIcon?: () => JSX.Element,
  submitBtnText: string,
  onSubmit: (event: FormEvent) => void,
  setOpenedPanel?: Dispatch<SetStateAction<string[]>>
  extraButtons?: ReactNode[]
  afterSubmitButtons?: ReactNode[]
  titleBadge?: ReactNode
  readOnly?: boolean
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
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target.tagName !== "TEXTAREA") {
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography component="h2" noWrap className={`${formType}-component-title`}>
                {formTitle}
              </Typography>
              {titleBadge}
            </Box>
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {extraButtons && extraButtons.map((btn, index) => <Box key={`button-${index}`}>{btn}</Box>)}
          {!readOnly && (
            <Button type="submit" variant="default" onClick={handleValidation} className="border-current">
              {submitBtnText}
            </Button>
          )}
          {afterSubmitButtons && afterSubmitButtons.map((btn, index) => <Box key={`after-${index}`}>{btn}</Box>)}
        </Box>
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
  extraButtons?: ReactNode[]
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {extraButtons && extraButtons.map((btn, index) => <Box key={`button-${index}`}>{btn}</Box>)}
        </Box>
      </Grid>
      {children}
    </Box>
  );
}