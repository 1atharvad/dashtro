#!/bin/bash
# Enforces CLAUDE.md Hard Rules > Execution & verification:
# never self-initiate tests/lint/tsc/builds/docker/dev-servers to check that
# a change works. Forces a confirmation prompt on every matching command so
# it only runs when the user actually asked for it in this instance.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

PATTERN='(^|[;&|]|[[:space:]])(npm[[:space:]]+(run[[:space:]]+)?(dev|build|test|lint|preview|ci|precommit)[a-zA-Z0-9:_-]*|npm[[:space:]]+(test|start)|npx[[:space:]]+tsc|tsc|pytest|python3?[[:space:]]+-m[[:space:]]+pytest|vite[[:space:]]+(build|dev|preview)|docker[[:space:]]+(build|run|compose)|docker-compose|uvicorn)([[:space:]]|$)'

if echo "$COMMAND" | grep -qEi "$PATTERN"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "cms-tool requires the user to explicitly ask for verification/execution commands (tests, lint, tsc, build, docker, dev servers) in this specific instance — never self-initiated to check a change works. See CLAUDE.md Hard Rules > Execution & verification."
    }
  }'
else
  exit 0
fi
