import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

export const MermaidDiagram = ({ code }: { code: string }) => {
  const id = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    setError(null);
    mermaid.render(`mermaid-${id}`, code.trim())
      .then(({ svg }) => {
        if (containerRef.current) containerRef.current.innerHTML = svg;
      })
      .catch(err => setError(String(err)));
  }, [code, id]);

  if (error) return <pre style={{ color: '#d32f2f', fontSize: 12 }}>{error}</pre>;
  return <div ref={containerRef} />;
};
