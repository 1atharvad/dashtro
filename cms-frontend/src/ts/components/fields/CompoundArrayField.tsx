import { MouseEvent, useCallback, useRef, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Accordion, AccordionDetails, AccordionSummary,
  Box, IconButton, Tooltip, Typography,
} from '@mui/material';
import { Plus as AddIcon, Trash2 as DeleteIcon, GripVertical as DragIcon, ChevronDown as ExpandIcon } from 'lucide-react';
import { FileField } from '@ts/components/fields/FileField';
import { ImageField } from '@ts/components/fields/ImageField';
import { LinkField } from '@ts/components/fields/LinkField';
import { CompoundField } from '@ts/components/fields/CompoundField';
import { getCompoundDef, getCompoundDefault } from '@ts/config/fieldRegistry';

type Item = Record<string, unknown>;

const itemLabel = (fieldType: string, item: Item, index: number): string => {
  if (fieldType === 'URL')   return String(item?.name  || item?.url        || `Link ${index + 1}`);
  if (fieldType === 'Image') return String(item?.alt_text || item?.url      || `Image ${index + 1}`);
  if (fieldType === 'File')  return String(item?.text  || item?.url        || `File ${index + 1}`);
  const def = getCompoundDef(fieldType);
  const first = def?.subfields[0];
  return String((first && item?.[first.name]) || `Item ${index + 1}`);
};

const ItemRenderer = ({
  fieldType, value, onChange, disabled,
}: {
  fieldType: string; value: Item; onChange: (v: Item) => void; disabled: boolean;
}) => {
  if (fieldType === 'URL')   return <LinkField   label="" value={value} onChange={onChange} disabled={disabled} />;
  if (fieldType === 'Image') return <ImageField  label="" value={value} onChange={onChange} disabled={disabled} />;
  if (fieldType === 'File')  return <FileField   label="" value={value} onChange={onChange} disabled={disabled} />;
  return <CompoundField fieldType={fieldType} label="" value={value} onChange={onChange} disabled={disabled} />;
};

const SortableItem = ({
  id, index, fieldType, item, expanded, onToggle, onRemove, onUpdate, readOnly,
}: {
  id: string; index: number; fieldType: string; item: Item;
  expanded: boolean; onToggle: () => void; onRemove: () => void;
  onUpdate: (v: Item) => void; readOnly: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  return (
    <Box ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), zIndex: isDragging ? 10 : 'auto' }}
      className={`nested-array-accordion-wrapper${isDragging ? ' nested-array-accordion-wrapper--dragging' : ''}`}
    >
      <Accordion expanded={expanded} onChange={onToggle} disableGutters elevation={0}
        className="nested-array-accordion" slotProps={{ transition: { unmountOnExit: false } }}>
        <AccordionSummary component="div" expandIcon={<ExpandIcon />} className="nested-array-accordion-summary">
          {!readOnly && (
            <Box className="nested-array-drag-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
              <DragIcon className="h-4 w-4" />
            </Box>
          )}
          <Typography className="nested-array-item-label">{itemLabel(fieldType, item, index)}</Typography>
          {!readOnly && (
            <Tooltip title="Remove">
              <IconButton type="button" size="small" className="nested-array-delete-btn"
                onClick={e => { e.stopPropagation(); onRemove(); }}>
                <DeleteIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          )}
        </AccordionSummary>
        <AccordionDetails className="nested-array-accordion-details">
          <ItemRenderer fieldType={fieldType} value={item} onChange={onUpdate} disabled={readOnly} />
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export const CompoundArrayField = ({
  label, fieldName, fieldType, value, onChange, readOnly = false,
}: {
  label: string; fieldName: string; fieldType: string;
  value: Item[]; onChange: (v: Item[]) => void; readOnly?: boolean;
}) => {
  const [expanded, setExpanded] = useState<string | false>(false);
  const items: Item[] = Array.isArray(value) ? value : [];
  const ids = items.map((_, i) => `${fieldName}-${i}`);

  const itemsRef = useRef(items); itemsRef.current = items;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = () => setExpanded(false);
  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const cur = itemsRef.current;
    const curIds = cur.map((_, i) => `${fieldName}-${i}`);
    onChangeRef.current(arrayMove(cur, curIds.indexOf(active.id as string), curIds.indexOf(over.id as string)));
  }, [fieldName]);

  const addItem = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    const next = itemsRef.current.length;
    onChangeRef.current([...itemsRef.current, getCompoundDefault(fieldType)]);
    setExpanded(`${fieldName}-${next}`);
  }, [fieldName, fieldType]);

  return (
    <Box className="nested-array-field">
      <Box className="nested-array-header">
        <label className="nested-variable-label">{label}</label>
        {!readOnly && (
          <Tooltip title="Add item">
            <IconButton type="button" size="small" onClick={addItem} className="nested-array-add-btn">
              <AddIcon className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {items.length === 0 && <Typography className="nested-array-empty">No items yet</Typography>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <Box className="nested-array-accordions">
            {items.map((item, index) => (
              <SortableItem key={ids[index]} id={ids[index]} index={index}
                fieldType={fieldType} item={item} expanded={expanded === ids[index]}
                onToggle={() => setExpanded(p => p === ids[index] ? false : ids[index])}
                onRemove={() => { onChangeRef.current(itemsRef.current.filter((_, i) => i !== index)); setExpanded(false); }}
                onUpdate={updated => onChangeRef.current(itemsRef.current.map((it, i) => i === index ? updated : it))}
                readOnly={readOnly}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Box>
  );
};
