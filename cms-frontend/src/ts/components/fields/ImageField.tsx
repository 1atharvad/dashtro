import { useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import { RefreshCw as ReplaceIcon, X as CloseIcon, ExternalLink as OpenInNewIcon, Upload as UploadIcon } from 'lucide-react';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';

type ImageValue = {
  url: string;
  alt: string;
  width: number | '';
  height: number | '';
  classes: string;
};

const DEFAULT: ImageValue = { url: '', alt: '', width: '', height: '', classes: '' };

const parseValue = (raw: any): ImageValue => {
  if (raw && typeof raw === 'object') return {
    ...DEFAULT,
    ...raw,
    alt: raw.alt ?? '',
    width: raw.width !== '' && raw.width != null ? Number(raw.width) : '',
    height: raw.height !== '' && raw.height != null ? Number(raw.height) : '',
  };
  return DEFAULT;
};

export const ImageField = ({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: any;
  onChange: (value: ImageValue) => void;
  disabled?: boolean;
}) => {
  const img = parseValue(value);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof ImageValue) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...img, [key]: e.target.value });

  const setNum = (key: 'width' | 'height') => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...img, [key]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0) });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await authFetch(`${API_BASE_URL}/media/`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? 'Upload failed');
      }
      const data = await res.json();
      onChange({ ...img, url: data.url });
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sharedProps = {
    disabled,
    slotProps: { inputLabel: { shrink: true } },
  };

  const fields = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Upload area */}
        <Box className="image-field-upload">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={disabled || uploading}
          />

          {img.url ? (
            <Box className="image-field-preview">
              <a href={img.url} target="_blank" rel="noopener noreferrer" style={{ display: 'contents' }}>
                <img
                  src={img.url}
                  alt={img.alt || 'preview'}
                  className="image-field-preview-img"
                  style={{
                    width: img.width !== '' ? `${img.width}px` : undefined,
                    height: img.height !== '' ? `${img.height}px` : undefined,
                    cursor: 'pointer',
                  }}
                />
              </a>
              <Box className="image-field-preview-actions">
                  <Tooltip title="Open image in new tab">
                    <IconButton size="small" href={img.url} target="_blank" rel="noopener noreferrer">
                      <OpenInNewIcon className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                  {!disabled && (
                    <>
                      <Tooltip title="Replace image">
                        <IconButton size="small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                          <ReplaceIcon className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove image">
                        <IconButton size="small" onClick={() => onChange({ ...img, url: '' })}>
                          <CloseIcon className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
            </Box>
          ) : (
            <Box
              className={`image-field-dropzone${disabled ? ' image-field-dropzone--disabled' : ''}`}
              onClick={() => !disabled && fileInputRef.current?.click()}
            >
              {uploading ? (
                <CircularProgress size={24} />
              ) : (
                <>
                  <UploadIcon className="h-4 w-4" style={{ opacity: 0.5 }} />
                  <Typography variant="body2" sx={{ opacity: 0.6 }}>Click to upload image</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.4 }}>PNG, JPG, GIF, WebP — max 10 MB</Typography>
                </>
              )}
            </Box>
          )}

          {error && (
            <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
              {error}
            </Typography>
          )}
        </Box>

        {/* Attributes */}
        <TextField
          {...sharedProps}
          fullWidth
          label="Alt Text"
          value={img.alt}
          onChange={set('alt')}
          placeholder="Describe the image"
        />

        <Box className="image-field-row">
          <TextField
            {...sharedProps}
            fullWidth
            label="Width"
            type="number"
            value={img.width}
            onChange={setNum('width')}
            placeholder="e.g. 800"
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, step: 1 } }}
          />
          <TextField
            {...sharedProps}
            fullWidth
            label="Height"
            type="number"
            value={img.height}
            onChange={setNum('height')}
            placeholder="e.g. 600"
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, step: 1 } }}
          />
        </Box>

        <TextField
          {...sharedProps}
          fullWidth
          label="CSS Classes"
          value={img.classes}
          onChange={set('classes')}
          placeholder="e.g. rounded shadow-md"
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
