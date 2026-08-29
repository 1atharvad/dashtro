// Tailwind classes typed here won't do anything — this source is stored in
// the database, not scanned by Tailwind's build-time compiler (which only
// looks at index.html / src/**/*.tsx). Write real CSS in the CSS panel
// instead and reference it by class name here.
export const DEFAULT_COMPONENT_SOURCE = `// Styling only — write CSS in the CSS panel and reference classes here. No JS behaviour.
const Component = ({ children }) => (
  <div className="rtc-wrapper">
    {children}
  </div>
);`;

export const DEFAULT_COMPONENT_CSS = `.rtc-wrapper {
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
}`;

export const DEFAULT_SAMPLE_HTML =
  '<p>Sample <strong>rich text</strong> content goes here.</p>\n<p>Add more paragraphs, lists, or headings to test your wrapper.</p>';
