import { useMediaQuery } from '@mui/material';

export const EXTRA_SMALL_BREAKPOINT_QUERY = '(max-width: 425px)';

/** True below the extra-small breakpoint (425px), used to stack side-by-side form fields full-width. */
export const useExtraSmallBreakpoint = (): boolean => useMediaQuery(EXTRA_SMALL_BREAKPOINT_QUERY);
