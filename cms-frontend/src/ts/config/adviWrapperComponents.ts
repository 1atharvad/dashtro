import { Card } from 'advi-ui';

// Curated advi-ui components offered as RichText wrapper options.
// Keep in sync by hand with ADVI_WRAPPER_COMPONENTS in cms_backend/models/field_types.py.
export const ADVI_WRAPPER_COMPONENTS: Record<string, React.ComponentType<{ children?: React.ReactNode }>> = {
  Card,
};
