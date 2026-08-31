import { Box, Typography } from '@mui/material';
import MonacoEditor from '@monaco-editor/react';

// Shared so every pane using this looks and behaves identically.
// `acceptSuggestionOnEnter: 'off'` + `quickSuggestions: false` keep Enter as a
// plain newline — otherwise the HTML language service's autocomplete widget
// (triggered by tags/attributes) swallows Enter to accept a suggestion instead.
const MONACO_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  automaticLayout: true,
  padding: { top: 16 },
  quickSuggestions: false,
  acceptSuggestionOnEnter: 'off' as const,
};

export const MonacoEditorPane = ({
  label,
  language,
  value,
  onChange,
  className,
  bodyClassName,
}: {
  label: string;
  language: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  bodyClassName?: string;
}) => (
  <Box className={className}>
    <Typography className="rtc-pane-label">{label}</Typography>
    <Box className={bodyClassName}>
      <MonacoEditor
        height="100%"
        language={language}
        theme="vs-dark"
        value={value}
        onChange={v => onChange(v ?? '')}
        options={MONACO_EDITOR_OPTIONS}
      />
    </Box>
  </Box>
);
