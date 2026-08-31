import { useEffect, useRef, useState } from 'react';

/**
 * Drag-to-resize a vertical split pane, persisting the chosen percentage to
 * localStorage under `storageKey` so it survives a reload.
 */
export const useResizableSplit = ({
  storageKey,
  defaultPercent,
  minPercent,
  maxPercent,
}: {
  storageKey: string;
  defaultPercent: number;
  minPercent: number;
  maxPercent: number;
}) => {
  const [splitPercent, setSplitPercent] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return saved >= minPercent && saved <= maxPercent ? saved : defaultPercent;
  });
  const splitPercentRef = useRef(splitPercent);
  splitPercentRef.current = splitPercent;
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((event.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(maxPercent, Math.max(minPercent, percent)));
    };
    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(storageKey, String(splitPercentRef.current));
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [storageKey, minPercent, maxPercent]);

  const handleResizeStart = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  return { splitPercent, containerRef, handleResizeStart };
};
