import vm from 'node:vm';
import React, { type ReactElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// A default import (`import Babel from ...`) breaks here: the package sets
// `__esModule: true` but has no actual `default` export (only named ones
// like `transform`), so esModuleInterop's default-import handling passes it
// through unwrapped and `Babel` resolves to `mod.default` -> undefined. A
// namespace import reads the named exports directly instead.
import * as Babel from '@babel/standalone';

let AdviUI: Record<string, ComponentType<{ children?: ReactElement }>> = {};
try {
  AdviUI = require('advi-ui');
} catch {
  AdviUI = {};
}

type RenderInput = {
  kind: string;
  name?: string;
  source?: string;
  contentHtml?: string;
};

// Renders a RichText wrapper component (built-in advi-ui, or a stored custom
// component's JSX source) around already-markdown-to-HTML'd field content,
// returning static markup — no client runtime, no component reference.
class ComponentRenderer {
  private readonly buildChildren = (contentHtml: string | undefined): ReactElement =>
    React.createElement('span', { dangerouslySetInnerHTML: { __html: contentHtml || '' } });

  private readonly renderAdvi = (name: string, children: ReactElement): string => {
    const Component = AdviUI[name];
    if (!Component) throw new Error(`Unknown advi wrapper component: ${name}`);
    return renderToStaticMarkup(React.createElement(Component, null, children));
  };

  private readonly renderCustom = (source: string, children: ReactElement): string => {
    const compiled = Babel.transform(source || '', { presets: ['react'] }).code as string;
    const moduleExports: { Component?: unknown } = {};
    const sandbox = { React, exports: moduleExports };
    vm.createContext(sandbox);
    try {
      vm.runInContext(`${compiled}\nexports.Component = Component;`, sandbox, { timeout: 2000 });
    } catch (err) {
      throw new Error(
        `Component source failed to evaluate: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const Component = moduleExports.Component;
    if (typeof Component !== 'function') {
      throw new Error('Component source did not define a `Component`.');
    }
    return renderToStaticMarkup(React.createElement(Component as ComponentType, null, children));
  };

  render = (input: RenderInput): string => {
    const children = this.buildChildren(input.contentHtml);
    if (input.kind === 'advi') return this.renderAdvi(input.name ?? '', children);
    if (input.kind === 'custom') return this.renderCustom(input.source ?? '', children);
    throw new Error(`Unknown wrapper kind: ${input.kind}`);
  };
}

const readStdin = (): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });

const main = async (): Promise<void> => {
  const raw = await readStdin();

  let input: RenderInput;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Invalid input JSON: ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  const renderer = new ComponentRenderer();
  try {
    process.stdout.write(renderer.render(input));
  } catch (err) {
    process.stderr.write(err instanceof Error && err.stack ? err.stack : String(err));
    process.exit(1);
  }
};

main();
