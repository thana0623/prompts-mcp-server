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

    if (tool !== 'Write' && tool !== 'Edit') {
      process.exit(0);
    }

    // Always allow focus-spec and task-state writes
    if (file.includes('focus-spec.md') || file.includes('task-state.json')) {
      process.exit(0);
    }

    if (stage === 'spec-pending') {
      process.stderr.write(`BLOCKED: stage=spec-pending, tool=${tool}, file=${file}\n`);
      process.stderr.write('focus-spec has not been confirmed. Complete requirements pre-check and enter y/approve in terminal.\n');
      process.exit(2);
    }

    // stage=confirmed: scope check against focus-spec IN patterns
    const specPath = path.join(process.cwd(), '.github', 'prompts', 'focus-spec.md');
    let specContent = '';
    try {
      specContent = fs.readFileSync(specPath, 'utf8');
    } catch (_) {
      process.stderr.write(`BLOCKED: cannot read focus-spec.md, tool=${tool}, file=${file}\n`);
      process.exit(2);
    }

    // Extract IN: lines
    const inPatterns = [];
    const lines = specContent.split('\n');
    for (const line of lines) {
      const match = line.match(/^IN:\s*(.+)$/);
      if (match) {
        inPatterns.push(match[1].trim());
      }
    }

    // No IN patterns → block all
    if (inPatterns.length === 0) {
      process.stderr.write(`BLOCKED: focus-spec has no IN scope defined, tool=${tool}, file=${file}\n`);
      process.stderr.write('Run pmcp new-requirement to start a new task, or add IN: patterns to focus-spec.md.\n');
      process.exit(2);
    }

    // Wildcard * → allow all
    if (inPatterns.includes('*')) {
      process.exit(0);
    }

    // Normalize file path: absolute → relative, then normalize separators
    let normalizedFile = file.replace(/\\/g, '/');
    const cwd = process.cwd().replace(/\\/g, '/');
    if (normalizedFile.startsWith(cwd + '/')) {
      normalizedFile = normalizedFile.slice(cwd.length + 1);
    }
    normalizedFile = normalizedFile.replace(/^\.[/]/, '').replace(/^\//, '');

    // Check if file matches any IN pattern
    const matches = inPatterns.some(pattern => {
      const normalizedPattern = pattern.replace(/\\/g, '/');
      if (normalizedPattern.endsWith('/**')) {
        const dir = normalizedPattern.slice(0, -3);
        return normalizedFile.startsWith(dir + '/') || normalizedFile === dir;
      }
      if (normalizedPattern.includes('*')) {
        const regex = new RegExp('^' + normalizedPattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
        return regex.test(normalizedFile);
      }
      return normalizedFile === normalizedPattern || normalizedFile.startsWith(normalizedPattern + '/');
    });

    if (!matches) {
      process.stderr.write(`BLOCKED: 此文件不在当前 focus-spec 范围内, tool=${tool}, file=${file}\n`);
      process.stderr.write(`Allowed scope: ${inPatterns.join(', ')}\n`);
      process.stderr.write('如属新需求，请运行 pmcp new-requirement。\n');
      process.exit(2);
    }

    process.exit(0);
  } catch (_) {
    process.exit(0);
  }
});
