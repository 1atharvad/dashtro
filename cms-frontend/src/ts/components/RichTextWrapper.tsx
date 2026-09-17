import MarkdownPreview from '@uiw/react-markdown-preview';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import rehypeRaw from 'rehype-raw';
import { ADVI_WRAPPER_COMPONENTS } from '@ts/utils/adviWrapperComponents';
import { MermaidDiagram } from '@ts/components/MermaidDiagram';
import type { RichTextComponent } from '@ts/types/constants';
import { componentScopeClass, scopeCss } from '@ts/utils/richTextScoping';

const REHYPE_PLUGINS = [rehypeRaw];

// Matches an inline component reference's opening tag, same convention as
// the backend's `_INLINE_TAG_RE` in rich_text_render.py — a capitalized
// name is always a component reference, never literal markdown/HTML.
const INLINE_TAG_NAME_RE = /<([A-Z][A-Za-z0-9]*)>/g;

function findUnknownComponentNames(source: string, knownNames: Set<string>): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(INLINE_TAG_NAME_RE)) {
    if (!knownNames.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

// A component authored via a JS source string (react-live eval), as opposed
// to a built-in advi-ui component (already a real React component).
const CustomInlineComponent = ({
  name,
  source,
  css,
  children,
  inline = false,
}: {
  name: string;
  source: string;
  css?: string;
  children?: React.ReactNode;
  // `<LivePreview>` defaults to a wrapping `<div>` regardless of the
  // component's own markup — wrong for a mid-paragraph inline tag.
  inline?: boolean;
}) => {
  const code = `${source}\nrender(<Component>{__children}</Component>);`;
  return (
    <>
      {css && <style>{scopeCss(css, name)}</style>}
      <LiveProvider code={code} scope={{ ...ADVI_WRAPPER_COMPONENTS, __children: children }} noInline>
        <LivePreview Component={inline ? 'span' : 'div'} className={componentScopeClass(name)} />
        <LiveError style={{ color: 'var(--cms-error, #d32f2f)', fontSize: 12, whiteSpace: 'pre-wrap' }} />
      </LiveProvider>
    </>
  );
};

// rehype-raw parses inline tags (e.g. `<HighlightedText>...</HighlightedText>`
// typed straight into the markdown) through an HTML tree parser, which lower-
// cases any tag name it doesn't recognize as standard HTML — so a defined
// component's react-markdown `components` override key has to be lowercase,
// matched case-insensitively against the stored component name.
function buildMarkdownComponents(customComponents: RichTextComponent[] | undefined) {
  const components: Record<string, (props: { children?: React.ReactNode }) => React.ReactNode> = {
    code({ className, children }: { className?: string; children?: React.ReactNode }) {
      if (className?.includes('language-mermaid')) {
        return <MermaidDiagram code={String(children)} />;
      }
      return <code className={className}>{children}</code>;
    },
  };
  for (const [name, Component] of Object.entries(ADVI_WRAPPER_COMPONENTS)) {
    components[name.toLowerCase()] = ({ children }) => <Component>{children}</Component>;
  }
  for (const component of customComponents ?? []) {
    components[component.name.toLowerCase()] = ({ children }) => (
      <CustomInlineComponent name={component.name} source={component.source} css={component.css} inline>
        {children}
      </CustomInlineComponent>
    );
  }
  return components;
}

type ResolvedWrapper =
  | { kind: 'advi'; Component: React.ComponentType<{ children?: React.ReactNode }> }
  | { kind: 'custom'; name: string; source: string; css: string }
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
    return found ? { kind: 'custom', name: found.name, source: found.source, css: found.css } : null;
  }
  return null;
}

export const RichTextWrapperRenderer = ({
  wrapperKey,
  source,
  customComponents,
  componentsLoading,
}: {
  wrapperKey?: string;
  source: string;
  customComponents?: RichTextComponent[];
  componentsLoading?: boolean;
}) => {
  // Rendering against a still-loading (empty) component list produces a
  // raw unrecognized-tag fallback or a false "not defined" — wait it out.
  if (componentsLoading) return null;

  const wrapper = resolveWrapper(wrapperKey, customComponents);
  const unresolvedWrapperName = wrapperKey && !wrapper ? wrapperKey.split(':')[1] : null;

  const knownNames = new Set([
    ...Object.keys(ADVI_WRAPPER_COMPONENTS),
    ...(customComponents ?? []).map(c => c.name),
  ]);
  const unknownInlineNames = findUnknownComponentNames(source || '', knownNames);

  if (unresolvedWrapperName || unknownInlineNames.length > 0) {
    const names = [...new Set([...unknownInlineNames, ...(unresolvedWrapperName ? [unresolvedWrapperName] : [])])];
    return (
      <span className="rich-text-unknown-component">
        RichText component{names.length > 1 ? 's' : ''} not defined: {names.join(', ')}
      </span>
    );
  }

  const children = (
    <MarkdownPreview
      source={source || ''}
      rehypePlugins={REHYPE_PLUGINS}
      components={buildMarkdownComponents(customComponents)}
    />
  );

  if (!wrapper) return children;

  if (wrapper.kind === 'advi') {
    const { Component } = wrapper;
    return <Component>{children}</Component>;
  }

  return (
    <CustomInlineComponent name={wrapper.name} source={wrapper.source} css={wrapper.css}>
      {children}
    </CustomInlineComponent>
  );
};
