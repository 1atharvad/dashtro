import { useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { RefreshCw as ReplaceIcon, X as CloseIcon, File as FileIcon, ExternalLink as OpenInNewIcon, Upload as UploadIcon } from 'lucide-react';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';

export const FileField = ({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => {
  const url: string = typeof value === 'string' ? value : '';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const filename = url ? url.split('/').pop() || url : '';

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
      onChange(data.url);
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fields = (
    <Box className="image-field-upload">
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={disabled || uploading}
          />

          {url ? (
            <Box className="file-field-preview">
              <FileIcon className="file-field-preview-icon" />
              <Typography className="file-field-preview-name" title={filename}>
                {filename}
              </Typography>
              <Box className="file-field-preview-actions">
                <Tooltip title="Open file in new tab">
                  <IconButton size="small" href={url} target="_blank" rel="noopener noreferrer">
                    <OpenInNewIcon className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
                {!disabled && (
                  <>
                    <Tooltip title="Replace file">
                      <IconButton size="small" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <ReplaceIcon className="h-4 w-4" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove file">
                      <IconButton size="small" onClick={() => onChange('')}>
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
                  <Typography variant="body2" sx={{ opacity: 0.6 }}>Click to upload file</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.4 }}>PDF, DOCX, ZIP, etc. — max 10 MB</Typography>
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
  );

  if (!label) return fields;

  return (
    <Box className="compound-field">
      <label className="compound-field-label">{label}</label>
      <Box className="compound-field-body">{fields}</Box>
    </Box>
  );
};
