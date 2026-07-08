import MarkdownPreview from '@uiw/react-markdown-preview';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import rehypeRaw from 'rehype-raw';
import { ADVI_WRAPPER_COMPONENTS } from '@ts/config/adviWrapperComponents';
import { MermaidDiagram } from '@ts/components/MermaidDiagram';
import type { RichTextComponent } from '@ts/types/constants';

const REHYPE_PLUGINS = [rehypeRaw];

// Intercept ```mermaid code fences and render as real diagrams.
const MARKDOWN_COMPONENTS = {
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    if (className?.includes('language-mermaid')) {
      return <MermaidDiagram code={String(children)} />;
    }
    return <code className={className}>{children}</code>;
  },
};

type ResolvedWrapper =
  | { kind: 'advi'; Component: React.ComponentType<{ children?: React.ReactNode }> }
  | { kind: 'custom'; source: string; css: string }
  | null;

function resolveWrapper(
  wrapperKey: string | undefined,
  customComponents: RichTextComponent[] | undefined,
): ResolvedWrapper {
  if (!wrapperKey) return null;
  const [kind, name] = wrapperKey.split(':');
  if (kind === 'advi') {
    const Component = ADVI_WRAPPER_COMPONENTS[name];
    return Component ? { kind: 'advi', Component } : null;
  }
  if (kind === 'custom') {
    const found = customComponents?.find(c => c.name === name);
    return found ? { kind: 'custom', source: found.source, css: found.css } : null;
  }
  return null;
}

export const RichTextWrapperRenderer = ({
  wrapperKey,
  source,
  customComponents,
}: {
  wrapperKey?: string;
  source: string;
  customComponents?: RichTextComponent[];
}) => {
  const children = (
    <MarkdownPreview
      source={source || ''}
      rehypePlugins={REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    />
  );
  const wrapper = resolveWrapper(wrapperKey, customComponents);

  if (!wrapper) return children;

  if (wrapper.kind === 'advi') {
    const { Component } = wrapper;
    return <Component>{children}</Component>;
  }

  const code = `${wrapper.source}\nrender(<Component>{__children}</Component>);`;
  return (
    <>
      {wrapper.css && <style>{wrapper.css}</style>}
      <LiveProvider code={code} scope={{ ...ADVI_WRAPPER_COMPONENTS, __children: children }} noInline>
        <LivePreview />
        <LiveError style={{ color: 'var(--cms-error, #d32f2f)', fontSize: 12, whiteSpace: 'pre-wrap' }} />
      </LiveProvider>
    </>
  );
};
