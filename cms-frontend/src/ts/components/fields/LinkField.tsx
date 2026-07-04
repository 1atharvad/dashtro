import { Box, FormControlLabel, IconButton, Switch, TextField, Tooltip } from '@mui/material';
import { ExternalLink as OpenInNewIcon } from 'lucide-react';

type LinkValue = {
  url: string;
  name: string;
  is_external_link: boolean;
  classes: string;
  icon_id: string;
};

const DEFAULT: LinkValue = { url: '', name: '', is_external_link: false, classes: '', icon_id: '' };

const parseValue = (raw: unknown): LinkValue => {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    return {
      ...DEFAULT,
      ...r,
      is_external_link: r.is_external_link === true || r.is_external_link === 'true',
    };
  }
  return DEFAULT;
};

export const LinkField = ({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: unknown;
  onChange: (value: LinkValue) => void;
  disabled?: boolean;
}) => {
  const link = parseValue(value);

  const set = (key: keyof LinkValue) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...link, [key]: e.target.value });

  const sharedProps = {
    disabled,
    slotProps: { inputLabel: { shrink: true } },
    fullWidth: true,
  };

  const fields = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField {...sharedProps} label="URL" type="text" value={link.url} onChange={set('url')} placeholder="https://example.com" />
        {link.url && (
          <Tooltip title="Open in new tab">
            <IconButton size="small" href={link.url} target="_blank" rel="noopener noreferrer">
              <OpenInNewIcon className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <TextField {...sharedProps} label="Name" value={link.name} onChange={set('name')} placeholder="Link display text" />
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField {...sharedProps} label="CSS Classes" value={link.classes} onChange={set('classes')} placeholder="e.g. primary-btn" />
        <TextField {...sharedProps} label="Icon ID" value={link.icon_id} onChange={set('icon_id')} placeholder="e.g. linkedin" />
      </Box>
      <FormControlLabel
        label="Open in new tab"
        disabled={disabled}
        sx={{ pl: 1.5 }}
        control={<Switch checked={link.is_external_link} onChange={e => onChange({ ...link, is_external_link: e.target.checked })} size="small" />}
      />
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
