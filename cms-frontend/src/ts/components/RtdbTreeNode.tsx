import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, TextField, MenuItem, Tooltip } from '@mui/material';
import { ChevronRight, ChevronDown, Plus, Trash2, Pencil, Check, X, Wand2 } from 'lucide-react';
import type { JsonValue, JsonObject, RtdbValueType } from '@ts/types/constants';

const TYPE_OPTIONS: { value: RtdbValueType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'float', label: 'Float' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'null', label: 'Null' },
  { value: 'list', label: 'List' },
  { value: 'dict', label: 'Dict' },
];

const isPlainObject = (v: JsonValue): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Best-effort: JSON (and JS) numbers don't retain an int-vs-float tag, so a
 *  whole-numbered float that's already round-tripped through the backend
 *  will show as "Number" here. Only freshly-typed floats are guaranteed. */
const inferType = (value: JsonValue): RtdbValueType => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'object') return 'dict';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'float';
  return 'string';
};

const displayValue = (value: JsonValue): string => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

/** Firebase's RTDB console color-codes leaf values by type; mirrored here. */
const valueTypeClass = (value: JsonValue): string => {
  if (value === null) return 'rtdb-node-value--null';
  if (typeof value === 'boolean') return 'rtdb-node-value--boolean';
  if (typeof value === 'number') return 'rtdb-node-value--number';
  return 'rtdb-node-value--string';
};

type Computed = { value: JsonValue; raw?: string } | null;

/** Turns a (type, draft-text) pair into the value to store, plus an optional
 *  raw request-body override (see realtimeDbSlice's putRtdbPath). Returns
 *  null when the draft doesn't parse for the chosen type. List/Dict create
 *  an empty container — their contents are added afterwards through the
 *  tree itself, not typed in as raw JSON. */
const computeValue = (type: RtdbValueType, draft: string): Computed => {
  switch (type) {
    case 'string':
      return { value: draft };
    case 'boolean':
      return { value: draft === 'true' };
    case 'null':
      return { value: null };
    case 'dict':
      return { value: {} };
    case 'list':
      return { value: [] };
    case 'number': {
      const num = Math.trunc(parseFloat(draft));
      return Number.isNaN(num) ? null : { value: num, raw: String(num) };
    }
    case 'float': {
      const num = parseFloat(draft);
      if (Number.isNaN(num)) return null;
      return { value: num, raw: Number.isInteger(num) ? `${num}.0` : `${num}` };
    }
  }
};

const ValueEntryFields = ({
  type, draft, setDraft, onSubmit, error,
}: { type: RtdbValueType; draft: string; setDraft: (v: string) => void; onSubmit: () => void; error?: boolean }) => {
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSubmit(); };

  if (type === 'null' || type === 'dict' || type === 'list') return null;

  if (type === 'boolean') {
    return (
      <TextField select size="small" className="rtdb-value-input" value={draft || 'true'}
        onChange={e => setDraft(e.target.value)}>
        <MenuItem value="true">true</MenuItem>
        <MenuItem value="false">false</MenuItem>
      </TextField>
    );
  }

  return (
    <TextField size="small" className="rtdb-value-input" autoFocus error={error}
      helperText={error ? `Invalid ${type}` : undefined}
      value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKeyDown} />
  );
};

/** Inline "add entry" form. Used both for dict children (a named key) and
 *  list children (an auto-assigned index, so no key field is shown).
 *
 *  Choosing Dict or List doesn't just create an empty container — it opens
 *  a nested build area (recursively, via this same component) so you can
 *  keep adding key/value pairs or elements — each with its own independent
 *  type — before the whole thing commits in a single write. `onCancel` is
 *  omitted for nested forms, since "add another" has nothing to cancel. */
const AddEntryForm = ({ showKeyField, existingKeys = [], onAdd, onCancel }: {
  showKeyField: boolean;
  /** Sibling keys already present at this level — used to reject duplicates. */
  existingKeys?: string[];
  onAdd: (key: string, value: JsonValue, raw?: string) => void;
  onCancel?: () => void;
}) => {
  const [key, setKey] = useState('');
  const [type, setType] = useState<RtdbValueType>('string');
  const [draft, setDraft] = useState('');
  const [dictEntries, setDictEntries] = useState<JsonObject>({});
  const [listEntries, setListEntries] = useState<JsonValue[]>([]);

  const trimmedKey = key.trim();
  const isDuplicateKey = showKeyField && !!trimmedKey && existingKeys.includes(trimmedKey);
  const isContainerType = type === 'dict' || type === 'list';
  const isValueMissing = !isContainerType && computeValue(type, draft) === null;
  const canSubmit = (!showKeyField || (!!trimmedKey && !isDuplicateKey)) && !isValueMissing;

  const reset = () => { setKey(''); setType('string'); setDraft(''); setDictEntries({}); setListEntries([]); };

  const submit = () => {
    if (!canSubmit) return;
    if (type === 'dict') { onAdd(trimmedKey, dictEntries); reset(); return; }
    if (type === 'list') { onAdd(trimmedKey, listEntries); reset(); return; }
    const computed = computeValue(type, draft);
    if (!computed) return;
    onAdd(trimmedKey, computed.value, computed.raw);
    reset();
  };

  return (
    <Box className="rtdb-add-form-wrapper">
      <Box className="rtdb-add-form">
        {showKeyField && (
          <>
            <TextField size="small" placeholder="key" value={key} autoFocus
              error={isDuplicateKey}
              helperText={isDuplicateKey ? 'Key already exists' : undefined}
              onChange={e => setKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && type !== 'dict' && type !== 'list') submit(); if (e.key === 'Escape') onCancel?.(); }} />
            <Tooltip title="Auto-generate key">
              <IconButton size="small" onClick={() => setKey(crypto.randomUUID())}>
                <Wand2 className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </>
        )}
        <TextField select size="small" className="rtdb-type-select" value={type}
          onChange={e => setType(e.target.value as RtdbValueType)}>
          {TYPE_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
        </TextField>
        <ValueEntryFields type={type} draft={draft} setDraft={setDraft} onSubmit={submit} error={isValueMissing && draft !== ''} />
        <Tooltip title="Add">
          <IconButton size="small" onClick={submit} disabled={!canSubmit}>
            <Check className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        {onCancel && (
          <Tooltip title="Cancel">
            <IconButton size="small" onClick={onCancel}><X className="h-4 w-4" /></IconButton>
          </Tooltip>
        )}
      </Box>

      {type === 'dict' && (
        <Box className="rtdb-nested-entries">
          {Object.entries(dictEntries).map(([k, v]) => (
            <Box key={k} className="rtdb-pending-entry">
              <span className="rtdb-node-key">{k}</span>
              <span className={`rtdb-node-value ${valueTypeClass(v)}`}>{displayValue(v)}</span>
              <IconButton size="small" onClick={() => setDictEntries(prev => {
                const next = { ...prev }; delete next[k]; return next;
              })}><Trash2 className="h-4 w-4" /></IconButton>
            </Box>
          ))}
          <AddEntryForm showKeyField existingKeys={Object.keys(dictEntries)}
            onAdd={(k, v) => setDictEntries(prev => ({ ...prev, [k]: v }))} />
        </Box>
      )}

      {type === 'list' && (
        <Box className="rtdb-nested-entries">
          {listEntries.map((v, i) => (
            <Box key={i} className="rtdb-pending-entry">
              <span className="rtdb-node-key rtdb-node-key--fixed">[{i}]</span>
              <span className={`rtdb-node-value ${valueTypeClass(v)}`}>{displayValue(v)}</span>
              <IconButton size="small" onClick={() => setListEntries(prev => prev.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </Box>
          ))}
          <AddEntryForm showKeyField={false} onAdd={(_k, v) => setListEntries(prev => [...prev, v])} />
        </Box>
      )}
    </Box>
  );
};

type RtdbTreeNodeProps = {
  nodeKey: string;
  path: string;
  value: JsonValue;
  depth: number;
  /** True when this node's key is a list index — indices can't be renamed. */
  keyEditable?: boolean;
  /** Sibling keys at this level (excluding this node's own key) — used to reject duplicate renames. */
  siblingKeys?: string[];
  onSetPath: (path: string, value: JsonValue, raw?: string) => void;
  onDeletePath: (path: string) => void;
  onRenamePath: (oldPath: string, newPath: string, value: JsonValue) => void;
};

export const RtdbTreeNode = ({
  nodeKey, path, value, depth, keyEditable = true, siblingKeys = [], onSetPath, onDeletePath, onRenamePath,
}: RtdbTreeNodeProps) => {
  const [expanded, setExpanded] = useState(depth === 0);
  const [adding, setAdding] = useState(false);

  const [editingValue, setEditingValue] = useState(false);
  const [type, setType] = useState<RtdbValueType>('string');
  const [draft, setDraft] = useState('');

  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(nodeKey);

  const isList = Array.isArray(value);
  const isDict = isPlainObject(value);
  const container = isList || isDict;

  // Only leaf nodes flash — a container's `value` reference changes on every
  // write to any descendant, which would light up the whole ancestor chain
  // instead of just the text that actually changed.
  const [flash, setFlash] = useState(false);
  const prevValueRef = useRef(value);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevValueRef.current = value;
      return;
    }
    const prev = prevValueRef.current;
    prevValueRef.current = value;
    if (container || value === prev) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(timer);
  }, [value, container]);

  const isValueInvalid = computeValue(type, draft) === null;

  const startEditValue = () => {
    setType(inferType(value));
    setDraft(displayValue(value));
    setEditingValue(true);
  };
  const commitEditValue = () => {
    const computed = computeValue(type, draft);
    if (!computed) return;
    onSetPath(path, computed.value, computed.raw);
    setEditingValue(false);
  };

  const trimmedKeyDraft = keyDraft.trim();
  const isDuplicateKeyDraft = trimmedKeyDraft !== nodeKey && siblingKeys.includes(trimmedKeyDraft);

  const startEditKey = () => { if (!keyEditable) return; setKeyDraft(nodeKey); setEditingKey(true); };
  const commitEditKey = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed || trimmed === nodeKey || siblingKeys.includes(trimmed)) { setEditingKey(false); return; }
    const parentSegments = path.split('/').slice(0, -1);
    const newPath = [...parentSegments, trimmed].join('/');
    onRenamePath(path, newPath, value);
    setEditingKey(false);
  };

  const addChild = (key: string, val: JsonValue, raw?: string) => {
    const childPath = isList ? `${path}/${value.length}` : `${path}/${key}`;
    onSetPath(childPath, val, raw);
    setAdding(false);
  };

  return (
    <Box className="rtdb-node">
      <Box className={`rtdb-node-row${editingValue || editingKey ? ' rtdb-node-row--active' : ''}${flash ? ' rtdb-node-row--flash' : ''}`}>
        {container ? (
          <IconButton size="small" className="rtdb-expand-btn" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </IconButton>
        ) : (
          <Box className="rtdb-expand-spacer" />
        )}

        {editingKey ? (
          <TextField size="small" className="rtdb-key-input" value={keyDraft} autoFocus
            error={isDuplicateKeyDraft}
            helperText={isDuplicateKeyDraft ? 'Key already exists' : undefined}
            onChange={e => setKeyDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitEditKey(); if (e.key === 'Escape') setEditingKey(false); }} />
        ) : (
          <span className={`rtdb-node-key${keyEditable ? '' : ' rtdb-node-key--fixed'}`} onClick={startEditKey}>
            {isList ? `[${nodeKey}]` : nodeKey}
          </span>
        )}

        {container ? (
          <span className="rtdb-node-badge">{isList ? '[ ]' : '{ }'}</span>
        ) : editingValue ? (
          <ValueEntryFields type={type} draft={draft} setDraft={setDraft} onSubmit={commitEditValue} error={isValueInvalid} />
        ) : (
          <span className={`rtdb-node-value ${valueTypeClass(value)}`} onClick={startEditValue}>{displayValue(value)}</span>
        )}

        <Box className="rtdb-node-actions">
          {editingValue || editingKey ? (
            <>
              <Tooltip title="Save">
                <IconButton size="small" disabled={editingKey ? (!trimmedKeyDraft || isDuplicateKeyDraft) : isValueInvalid}
                  onClick={editingKey ? commitEditKey : commitEditValue}>
                  <Check className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Cancel">
                <IconButton size="small" onClick={() => { setEditingValue(false); setEditingKey(false); }}>
                  <X className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <>
              {!container && (
                <Tooltip title="Edit value">
                  <IconButton size="small" onClick={startEditValue}><Pencil className="h-4 w-4" /></IconButton>
                </Tooltip>
              )}
              {container && (
                <Tooltip title={isList ? 'Add element' : 'Add child'}>
                  <IconButton size="small" onClick={() => { setExpanded(true); setAdding(true); }}>
                    <Plus className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => onDeletePath(path)}><Trash2 className="h-4 w-4" /></IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>

      {container && expanded && (
        <Box className="rtdb-node-children">
          {isDict && Object.entries(value).map(([childKey, childValue]) => (
            <RtdbTreeNode
              key={childKey}
              nodeKey={childKey}
              path={`${path}/${childKey}`}
              value={childValue}
              depth={depth + 1}
              siblingKeys={Object.keys(value).filter(k => k !== childKey)}
              onSetPath={onSetPath}
              onDeletePath={onDeletePath}
              onRenamePath={onRenamePath}
            />
          ))}
          {isList && value.map((childValue: JsonValue, idx: number) => (
            <RtdbTreeNode
              key={idx}
              nodeKey={String(idx)}
              path={`${path}/${idx}`}
              value={childValue}
              depth={depth + 1}
              keyEditable={false}
              onSetPath={onSetPath}
              onDeletePath={onDeletePath}
              onRenamePath={onRenamePath}
            />
          ))}
          {adding && (
            <AddEntryForm showKeyField={isDict} existingKeys={isDict ? Object.keys(value) : []}
              onAdd={addChild} onCancel={() => setAdding(false)} />
          )}
        </Box>
      )}
    </Box>
  );
};

export const RtdbAddKeyForm = (props: { existingKeys?: string[]; onAdd: (key: string, value: JsonValue, raw?: string) => void; onCancel: () => void }) =>
  <AddEntryForm showKeyField {...props} />;
