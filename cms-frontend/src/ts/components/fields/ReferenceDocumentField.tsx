import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Select } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';

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
  const [loading, setLoading] = useState(false);

  // Keyed on a joined string, not the array reference, since callers often
  // pass a fresh array literal each render — depending on the array itself
  // would refetch on every render instead of only when its contents change.
  const referenceCollectionsKey = referenceCollections?.join(',') ?? '';

  useEffect(() => {
    if (!project_id || !referenceCollections?.length) return;

    const wsName = workspace_name ?? 'production';
    setLoading(true);
    Promise.all(
      referenceCollections.map(col =>
        authFetch(`${API_BASE_URL}/projects/${project_id}/workspace/${wsName}/collection/${col}/`)
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
          .then(data => ({ col, data }))
      )
    ).then(results => {
      const options: { label: string; value: string }[] = [];
      results.forEach(({ col, data }) => {
        if (data?._document_ids) {
          const labels: Record<string, string> = data._document_labels ?? {};
          data._document_ids.forEach((id: string) => {
            options.push({ label: `${col} — ${labels[id] ?? id}`, value: id });
          });
        }
      });
      setDocOptions(options);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project_id, workspace_name, referenceCollectionsKey]);

  return (
    <Select
      className="variable-input"
      label={label}
      options={docOptions.filter(opt => !excludeValues.includes(opt.value))}
      value={value || ''}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder ?? 'None'}
      searchable
      loading={loading}
      clearable
    />
  );
};
