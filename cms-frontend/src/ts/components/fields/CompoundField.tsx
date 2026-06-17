import { Box, Checkbox, FormControlLabel, TextField } from '@mui/material';
import { getCompoundDef } from '@ts/config/fieldRegistry';

/**
 * Generic renderer for compound field types that don't have a dedicated
 * component (i.e. hasDedicatedComponent is not true in the registry).
 *
 * Renders each subfield as a text input, number input, or checkbox
 * based on its inputType definition in fieldRegistry.ts.
 */
export const CompoundField = ({
  fieldType,
  label,
  value,
  onChange,
  disabled = false,
}: {
  fieldType: string;
  label: string;
  value: any;
  onChange: (value: Record<string, any>) => void;
  disabled?: boolean;
}) => {
  const def = getCompoundDef(fieldType);
  if (!def) return null;

  const current: Record<string, any> = value && typeof value === 'object' ? value : def.defaultValue;

  const set = (name: string, val: any) => onChange({ ...current, [name]: val });

  const fields = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {def.subfields.map(sf => {
          const fieldLabel = sf.label;
          const val = current[sf.name] ?? (sf.inputType === 'checkbox' ? false : sf.inputType === 'number' ? '' : '');

          if (sf.inputType === 'checkbox') {
            return (
              <FormControlLabel
                key={sf.name}
                disabled={disabled}
                label={fieldLabel}
                control={
                  <Checkbox
                    checked={Boolean(val)}
                    onChange={e => set(sf.name, e.target.checked)}
                    size="small"
                  />
                }
              />
            );
          }

          return (
            <TextField
              key={sf.name}
              fullWidth
              disabled={disabled}
              label={fieldLabel}
              type={sf.inputType}
              value={val}
              onChange={e => set(sf.name, sf.inputType === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          );
        })}
    </Box>
  );

  if (!label) return fields;

  return (
    <Box className="compound-field">
      <label className="compound-field-label">{label}</label>
      <Box className="compound-field-body">{fields}</Box>
    </Box>
  );
};
