// A component's raw CSS is author-supplied and often uses broad selectors
// (`p`, `.highlight`, ...) that would otherwise leak onto the rest of the
// page. Scope it to a wrapper class via native CSS nesting (supported in
// all current evergreen browsers) instead — no new build dependency.
export function componentScopeClass(name: string): string {
  return `rtc-comp-${name.replace(/[^A-Za-z0-9_-]/g, '') || 'component'}`;
}

export function scopeCss(css: string | undefined, name: string): string {
  const trimmed = css?.trim();
  if (!trimmed) return '';
  return `.${componentScopeClass(name)} {\n${trimmed}\n}`;
}
