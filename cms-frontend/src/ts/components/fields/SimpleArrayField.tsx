import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Plus as AddIcon, Trash2 as DeleteIcon, GripVertical as DragIcon } from 'lucide-react';
import { DocumentEntry } from '@ts/components/DocumentEntry';

const SortableItem = ({
  id,
  index,
  value,
  variableSchema,
  schemaDetails,
  onChange,
  onRemove,
  readOnly,
  fieldName,
  excludeValues,
}: {
  id: string;
  index: number;
  value: any;
  variableSchema: Record<string, any>;
  schemaDetails: Record<string, any>;
  onChange: (val: any) => void;
  onRemove: () => void;
  readOnly: boolean;
  fieldName: string;
  excludeValues: string[];
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), zIndex: isDragging ? 10 : 'auto' };

  return (
    <Box ref={setNodeRef} style={style} className={`simple-array-item${isDragging ? ' simple-array-item--dragging' : ''}`}>
      {!readOnly && (
        <Box className="nested-array-drag-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
          <DragIcon className="h-4 w-4" />
        </Box>
      )}
      <Box className="simple-array-item-field">
        <DocumentEntry
          id={`${fieldName}-arr-${index}`}
          variableSchema={{ ...variableSchema, _relation: 'OneToOne' }}
          variableEntryState={[
            { [fieldName]: value },
            updated => { onChange((updated as Record<string, any>)[fieldName]); return updated; },
          ]}
          schemaDetails={schemaDetails}
          readOnly={readOnly}
          excludeValues={excludeValues}
        />
      </Box>
      {!readOnly && (
        <Tooltip title="Remove">
          <IconButton type="button" size="small" className="nested-array-delete-btn" onClick={onRemove}>
            <DeleteIcon className="h-4 w-4" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export const SimpleArrayField = ({
  label,
  fieldName,
  variableSchema,
  schemaDetails,
  value,
  onChange,
  readOnly = false,
  defaultItem,
}: {
  label: string;
  fieldName: string;
  variableSchema: Record<string, any>;
  schemaDetails: Record<string, any>;
  value: any[];
  onChange: (value: any[]) => void;
  readOnly?: boolean;
  defaultItem: any;
}) => {
  const items: any[] = Array.isArray(value) ? value : [];
  const ids = items.map((_, i) => `${fieldName}-arr-${i}`);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (_event: DragStartEvent) => {};

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    onChange(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <Box className="nested-array-field">
      <Box className="nested-array-header">
        <label className="nested-variable-label">{label}</label>
        {!readOnly && (
          <Tooltip title="Add item">
            <IconButton type="button" size="small" onClick={() => onChange([...items, defaultItem])} className="nested-array-add-btn">
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
            {items.map((item, i) => (
              <SortableItem
                key={ids[i]}
                id={ids[i]}
                index={i}
                value={item}
                variableSchema={variableSchema}
                schemaDetails={schemaDetails}
                onChange={val => onChange(items.map((x, j) => j === i ? val : x))}
                onRemove={() => onChange(items.filter((_, j) => j !== i))}
                readOnly={readOnly}
                fieldName={fieldName}
                excludeValues={items.filter((_, j) => j !== i).map(String)}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Box>
  );
};
