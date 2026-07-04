import { MouseEvent, useCallback, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { Plus as AddIcon, Trash2 as DeleteIcon, GripVertical as DragIcon, ChevronDown as ExpandMoreIcon } from 'lucide-react';
import { DocumentEntry } from '@ts/components/DocumentEntry';
import type { SchemaFieldItem, DocumentData } from '@ts/types/constants';

type Item = DocumentData;

const SortableAccordion = ({
  id,
  index,
  item,
  schema,
  schemaDetails,
  expanded,
  onToggle,
  onRemove,
  onUpdate,
  onImmediateSaveItem,
  readOnly,
  fieldName,
}: {
  id: string;
  index: number;
  item: Item;
  schema: SchemaFieldItem[];
  schemaDetails: Record<string, SchemaFieldItem[]>;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (updated: Item) => void;
  onImmediateSaveItem?: (updated: Item) => void;
  readOnly: boolean;
  fieldName: string;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    zIndex: isDragging ? 10 : 'auto',
  };

  const displayField = schema.find(f => f._display_name) ?? schema.find(f => ['String', 'Email', 'URL'].includes(f._type));
  const rawLabel = displayField && item ? item[displayField._name] : undefined;
  const itemLabel = typeof rawLabel === 'string' && rawLabel ? rawLabel : `Item ${index + 1}`;

  return (
    <Box ref={setNodeRef} style={style} className={`nested-array-accordion-wrapper${isDragging ? ' nested-array-accordion-wrapper--dragging' : ''}`}>
      <Accordion
        expanded={expanded}
        onChange={onToggle}
        disableGutters
        elevation={0}
        className="nested-array-accordion"
        slotProps={{ transition: { unmountOnExit: false } }}
      >
        <AccordionSummary
          component="div"
          expandIcon={<ExpandMoreIcon />}
          className="nested-array-accordion-summary"
        >
          {!readOnly && (
            <Box
              className="nested-array-drag-handle"
              {...attributes}
              {...listeners}
              onClick={e => e.stopPropagation()}
            >
              <DragIcon className="h-4 w-4" />
            </Box>
          )}
          <Typography className="nested-array-item-label">{itemLabel}</Typography>
          {!readOnly && (
            <Tooltip title="Remove item">
              <IconButton
                type="button"
                size="small"
                className="nested-array-delete-btn"
                onClick={e => { e.stopPropagation(); onRemove(); }}
              >
                <DeleteIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          )}
        </AccordionSummary>
        <AccordionDetails className="nested-array-accordion-details">
          <Box className="nested-document-variable-container">
            {schema.map((entry, fi: number) => (
              <Box key={fi} className="nested-document-variable">
                <DocumentEntry
                  id={`${fieldName}-${index}-${entry['_index'] ?? fi}`}
                  variableSchema={entry}
                  variableEntryState={[item ?? {}, updatedValue => {
                    const newItem = typeof updatedValue === 'function'
                      ? (updatedValue as (prev: Item) => Item)(item ?? {})
                      : updatedValue as Item;
                    onUpdate(newItem);
                    return newItem;
                  }]}
                  schemaDetails={schemaDetails}
                  readOnly={readOnly}
                  onImmediateSave={onImmediateSaveItem ? (nestedFieldName, val) => {
                    onImmediateSaveItem({ ...(item ?? {}), [nestedFieldName]: val });
                  } : undefined}
                />
              </Box>
            ))}
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export const NestedDocumentArrayField = ({
  label,
  fieldName,
  schema,
  schemaDetails,
  value,
  onChange,
  onImmediateSave,
  readOnly = false,
}: {
  label: string;
  fieldName: string;
  schema: SchemaFieldItem[];
  schemaDetails: Record<string, SchemaFieldItem[]>;
  value: Item[];
  onChange: (value: Item[]) => void;
  onImmediateSave?: (value: Item[]) => void;
  readOnly?: boolean;
}) => {
  const [expanded, setExpanded] = useState<string | false>(false);

  const items: Item[] = Array.isArray(value) ? value : [];
  const ids = items.map((_, i) => `${fieldName}-item-${i}`);

  // Refs so callbacks always see the latest items/onChange without stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onImmediateSaveRef = useRef(onImmediateSave);
  onImmediateSaveRef.current = onImmediateSave;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = () => setExpanded(false);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = itemsRef.current;
    const currentIds = current.map((_, i) => `${fieldName}-item-${i}`);
    const oldIndex = currentIds.indexOf(active.id as string);
    const newIndex = currentIds.indexOf(over.id as string);
    onChangeRef.current(arrayMove(current, oldIndex, newIndex));
  }, [fieldName]);

  const addItem = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    const current = itemsRef.current;
    const newIndex = current.length;
    onChangeRef.current([...current, {}]);
    setExpanded(`${fieldName}-item-${newIndex}`);
  }, [fieldName]);

  const removeItem = useCallback((index: number) => {
    onChangeRef.current(itemsRef.current.filter((_, i) => i !== index));
    setExpanded(false);
  }, []);

  const updateItem = useCallback((index: number, updated: Item) => {
    onChangeRef.current(itemsRef.current.map((item, i) => (i === index ? updated : item)));
  }, []);

  const saveItemImmediately = useCallback((index: number, updated: Item) => {
    const newItems = itemsRef.current.map((item, i) => (i === index ? updated : item));
    onChangeRef.current(newItems);
    onImmediateSaveRef.current?.(newItems);
  }, []);

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

      {items.length === 0 && (
        <Typography className="nested-array-empty">No items yet</Typography>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <Box className="nested-array-accordions">
            {items.map((item, index) => (
              <SortableAccordion
                key={ids[index]}
                id={ids[index]}
                index={index}
                item={item}
                schema={schema}
                schemaDetails={schemaDetails}
                expanded={expanded === ids[index]}
                onToggle={() => setExpanded(prev => prev === ids[index] ? false : ids[index])}
                onRemove={() => removeItem(index)}
                onUpdate={updated => updateItem(index, updated)}
                onImmediateSaveItem={onImmediateSave ? updated => saveItemImmediately(index, updated) : undefined}
                readOnly={readOnly}
                fieldName={fieldName}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Box>
  );
};
