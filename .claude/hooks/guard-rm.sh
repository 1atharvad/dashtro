#!/bin/bash
# Enforces CLAUDE.md Hard Rules > Destructive actions:
# never rm/delete a file without explicit per-instance user authorization,
# even one that looks safe (untracked, scratch-looking). Forces a
# confirmation prompt on every matching command instead of relying on the
# model to remember to ask.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

PATTERN='(^|[;&|]|[[:space:]])(rm|unlink)[[:space:]]|[[:space:]]-delete([[:space:]]|$)|git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'

if echo "$COMMAND" | grep -qE "$PATTERN"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "cms-tool requires explicit per-instance authorization before any file-deletion command (rm/unlink/find -delete/git clean -f), even on files that look safe — see CLAUDE.md Hard Rules > Destructive actions."
    }
  }'
else
  exit 0
fi
