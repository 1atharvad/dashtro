import { useRef, useState } from 'react';
import { Box, InputAdornment, Popover, TextField, Typography } from '@mui/material';
import { HexColorPicker, HexColorInput } from 'react-colorful';

const PRESETS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#000000',
  '#ffffff', '#fca5a5', '#fdba74', '#fde047', '#86efac',
  '#5eead4', '#93c5fd', '#c4b5fd', '#f9a8d4', '#d1d5db',
];

const isValidHex = (v: string) => /^#[0-9A-Fa-f]{6}$/.test(v);

export const ColorPickerField = ({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (name: string, value: string) => void;
}) => {
  const swatchRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const color = isValidHex(value) ? value : '#000000';

  const handleChange = (hex: string) => onChange(name, hex);

  return (
    <>
      <TextField
        fullWidth
        label={label}
        value={value}
        placeholder="#000000"
        onChange={e => {
          const v = e.target.value;
          if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(name, v);
        }}
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Box
                  ref={swatchRef}
                  onClick={() => setOpen(true)}
                  sx={{
                    width: 22, height: 22, borderRadius: 0.5, flexShrink: 0,
                    bgcolor: color, border: '1px solid', borderColor: 'divider',
                    cursor: 'pointer',
                  }}
                />
              </InputAdornment>
            ),
          },
        }}
      />

      <Popover
        open={open}
        anchorEl={swatchRef.current}
        onClose={() => { (document.activeElement as HTMLElement | null)?.blur(); setOpen(false); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, width: 220, borderRadius: 2 } } }}
      >
        {/* Colorful picker */}
        <Box sx={{
          '& .react-colorful': { width: '100%', height: 160 },
          '& .react-colorful__saturation': { borderRadius: '6px 6px 0 0' },
          '& .react-colorful__hue': { borderRadius: '0 0 6px 6px', height: 14, mt: '2px' },
          '& .react-colorful__pointer': { width: 18, height: 18 },
        }}>
          <HexColorPicker color={color} onChange={handleChange} />
        </Box>

        {/* Hex input */}
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>#</Typography>
          <HexColorInput
            color={color}
            onChange={handleChange}
            prefixed={false}
            style={{
              flex: 1,
              border: '1px solid',
              borderColor: 'var(--mui-palette-divider, rgba(0,0,0,0.12))',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 13,
              fontFamily: 'monospace',
              background: 'transparent',
              color: 'inherit',
              outline: 'none',
              width: '100%',
            }}
          />
        </Box>

        {/* Preset swatches */}
        <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {PRESETS.map(preset => (
            <Box
              key={preset}
              onClick={() => handleChange(preset)}
              sx={{
                width: 18, height: 18, borderRadius: 0.5, cursor: 'pointer',
                bgcolor: preset,
                border: '1px solid', borderColor: preset === color ? 'primary.main' : 'divider',
                outline: preset === color ? '2px solid' : 'none',
                outlineColor: 'primary.main',
                outlineOffset: 1,
                flexShrink: 0,
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
  );
};
