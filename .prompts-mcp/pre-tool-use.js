#!/usr/bin/env node
/**
 * PreToolUse Hook — Minimal Runtime Veto
 * Reads tool call info from stdin (JSON), checks task-state.json stage,
 * blocks Write/Edit when stage is spec-pending (except focus-spec and task-state).
 *
 * Exit 0 = allow
 * Exit 2 = block (stderr shown to AI as feedback)
 */

const fs = require('fs');
const path = require('path');

// Read stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const tool = data.tool_name || '';
    const file = (data.tool_input && data.tool_input.file_path) || '';

    // Read state
    const statePath = path.join(process.cwd(), '.github', 'prompts', 'task-state.json');
    let stage = 'spec-pending';
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      stage = state.stage || 'spec-pending';
    } catch (_) {
      stage = 'spec-pending';
    }

    if (stage === 'spec-pending') {
      if (tool === 'Write' || tool === 'Edit') {
        // Allow focus-spec and task-state writes
        if (file.includes('focus-spec.md') || file.includes('task-state.json')) {
          process.exit(0);
        }
        process.stderr.write(`BLOCKED: stage=spec-pending, tool=${tool}, file=${file}\n`);
        process.stderr.write('focus-spec has not been confirmed. Complete requirements pre-check and enter y/approve in terminal.\n');
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (_) {
    process.exit(0);
  }
});
