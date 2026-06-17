import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MenuItem, TextField } from '@mui/material';
import { API_BASE_URL } from '@ts/config';

export const ReferenceDocumentField = ({
  label,
  value,
  onChange,
  referenceCollections,
  disabled = false,
  placeholder,
  excludeValues = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  referenceCollections: string[];
  disabled?: boolean;
  placeholder?: string;
  excludeValues?: string[];
}) => {
  const { project_id, workspace_name } = useParams<{ project_id: string; workspace_name: string }>();
  const [docOptions, setDocOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    if (!project_id || !referenceCollections?.length) return;

    const wsName = workspace_name ?? 'production';
    Promise.all(
      referenceCollections.map(col =>
        fetch(`${API_BASE_URL}/projects/${project_id}/workspace/${wsName}/collection/${col}/`)
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
          .then(data => ({ col, data }))
      )
    ).then(results => {
      const options: { label: string; value: string }[] = [];
      results.forEach(({ col, data }) => {
        if (data?._document_ids) {
          data._document_ids.forEach((id: string) => {
            options.push({ label: `${col} — ${id}`, value: id });
          });
        }
      });
      setDocOptions(options);
    });
  }, [project_id, workspace_name, referenceCollections?.join(',')]);

  return (
    <TextField
      select
      fullWidth
      label={label}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      slotProps={{ inputLabel: { shrink: true } }}
      className="variable-input"
    >
      <MenuItem value=""><em>None</em></MenuItem>
      {docOptions.filter(opt => !excludeValues.includes(opt.value)).map(opt => (
        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
      ))}
    </TextField>
  );
};
