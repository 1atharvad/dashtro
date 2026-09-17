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
    const updateFromClientY = (clientY: number) => {
      if (!isResizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(maxPercent, Math.max(minPercent, percent)));
    };
    const finishResize = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(storageKey, String(splitPercentRef.current));
    };

    const handleMouseMove = (event: MouseEvent) => updateFromClientY(event.clientY);
    // Dragging the handle would otherwise also scroll the page on touch
    // devices, since a touchmove is ambiguous between "resize" and "scroll"
    // — preventDefault only while a resize is actually in progress.
    const handleTouchMove = (event: TouchEvent) => {
      if (!isResizingRef.current) return;
      event.preventDefault();
      updateFromClientY(event.touches[0].clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', finishResize);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', finishResize);
    window.addEventListener('touchcancel', finishResize);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', finishResize);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', finishResize);
      window.removeEventListener('touchcancel', finishResize);
    };
  }, [storageKey, minPercent, maxPercent]);

  const handleResizeStart = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  return { splitPercent, containerRef, handleResizeStart };
};
