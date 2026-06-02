#!/usr/bin/env node
/**
 * PreToolUse Hook — Contract Immutability + Scope Guard
 *
 * Stage-based write control:
 *   spec-pending      → only focus-spec.md and task-state.json writable
 *   confirmed         → focus-spec.md BLOCKED; other files hash-verified + scope-checked
 *   task-planning     → focus-spec.md writable (add task breakdown); IN scope writable
 *   developing        → IN scope writable (ECC agent development)
 *   reviewing         → all writes BLOCKED (review is read-only)
 *   user-confirming   → only task-state.json writable (user decision)
 *   change-requested  → all project files writable (requirement change in progress)
 *   completed         → all writes BLOCKED (dev done, complete TODOs then archive)
 *   incomplete        → same as developing (resume interrupted work)
 *   archived          → all writes ALLOWED (contract done, ready for new requirement)
 *
 * Hash integrity:
 *   On every write during stage=confirmed, recompute focus-spec SHA256
 *   and compare with task-state.json contractHash. Mismatch → force stage to spec-pending.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const tool = data.tool_name || '';
    const file = (data.tool_input && data.tool_input.file_path) || '';

    // Phase 1: Non-write tools → allow
    if (tool !== 'Write' && tool !== 'Edit') {
      process.exit(0);
    }

    const cwd = process.cwd().replace(/\\/g, '/');
    const statePath = path.join(cwd, '.github', 'prompts', 'task-state.json');
    const specPath = path.join(cwd, '.github', 'prompts', 'focus-spec.md');

    // Read task state
    let stage = 'spec-pending';
    let storedHash = '';
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      stage = state.stage || 'spec-pending';
      storedHash = state.contractHash || '';
    } catch (_) {
      stage = 'spec-pending';
    }

    // Normalize file path
    let normalizedFile = file.replace(/\\/g, '/');
    if (normalizedFile.startsWith(cwd + '/')) {
      normalizedFile = normalizedFile.slice(cwd.length + 1);
    }
    normalizedFile = normalizedFile.replace(/^\.[/]/, '').replace(/^\//, '');

    // Phase 2: focus-spec.md write protection
    if (normalizedFile.endsWith('/focus-spec.md') || normalizedFile === 'focus-spec.md') {
      if (stage === 'confirmed') {
        process.stderr.write(`BLOCKED: 契约已锁定（stage=confirmed），禁止修改 focus-spec.md\n`);
        process.stderr.write(`如需变更需求，请让用户说出"需求变更"以解锁。\n`);
        process.exit(2);
      }
      // spec-pending and change-requested → allow
      process.exit(0);
    }

    // Phase 3: task-state.json → always allow
    if (normalizedFile.endsWith('/task-state.json') || normalizedFile === 'task-state.json') {
      process.exit(0);
    }

    // Phase 4: Other files — stage gate
    if (stage === 'spec-pending') {
      process.stderr.write(`BLOCKED: stage=spec-pending, tool=${tool}, file=${normalizedFile}\n`);
      process.stderr.write('focus-spec 尚未签字确认。请先完成需求预检并输入 y/approve。\n');
      process.exit(2);
    }

    // task-planning: focus-spec writable (add task breakdown), IN scope writable
    if (stage === 'task-planning') {
      // Allow focus-spec writes during task planning
      if (normalizedFile.endsWith('/focus-spec.md') || normalizedFile === 'focus-spec.md') {
        process.exit(0);
      }
      // Fall through to IN scope check below
    } else if (stage === 'developing' || stage === 'incomplete') {
      // developing/incomplete: IN scope writable, skip hash check
      // Fall through to IN scope check below
    } else if (stage === 'reviewing') {
      // reviewing: all writes BLOCKED (review is read-only)
      process.stderr.write(`BLOCKED: stage=reviewing, tool=${tool}, file=${normalizedFile}\n`);
      process.stderr.write('审查阶段禁止写入。请完成审查后进入用户确认阶段。\n');
      process.exit(2);
    } else if (stage === 'user-confirming') {
      // user-confirming: only task-state.json writable
      process.stderr.write(`BLOCKED: stage=user-confirming, tool=${tool}, file=${normalizedFile}\n`);
      process.stderr.write('用户确认阶段禁止写入业务文件。只允许更新 task-state.json。\n');
      process.exit(2);
    } else if (stage === 'confirmed') {
      // confirmed: hash integrity check, then fall through to IN scope check
      let specContent = '';
      try {
        specContent = fs.readFileSync(specPath, 'utf8');
      } catch (_) {
        process.stderr.write(`BLOCKED: 无法读取 focus-spec.md\n`);
        process.exit(2);
      }

      const actualHash = crypto.createHash('sha256').update(specContent).digest('hex');
      if (!storedHash) {
        process.stderr.write(`BLOCKED: stage=confirmed 但 contractHash 缺失，请重新确认需求。\n`);
        process.exit(2);
      }
      if (actualHash !== storedHash) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          state.stage = 'spec-pending';
          state.history = state.history || [];
          state.history.unshift({
            stage: 'spec-pending',
            entered: new Date().toISOString(),
            note: '契约完整性校验失败：focus-spec.md 被篡改，hash 不匹配'
          });
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
        } catch (writeErr) {
          process.stderr.write(`WARNING: 无法写入 task-state.json 回退状态: ${writeErr.message}\n`);
        }

        process.stderr.write(`BLOCKED: 契约完整性校验失败！focus-spec.md 已被篡改。\n`);
        process.stderr.write(`期望 hash: ${storedHash}\n实际 hash: ${actualHash}\n`);
        process.stderr.write(`stage 已回退到 spec-pending，请重新确认需求。\n`);
        process.exit(2);
      }
      // Hash OK → fall through to IN scope check
    }

    // Phase 4.5: completed stage — 开发完成，禁写引导完成 TODO
    if (stage === 'completed') {
      process.stderr.write(`BLOCKED: 需求已完成（stage=completed），开发写入已禁用。\n`);
      process.stderr.write(`请完成 focus-spec.md 中剩余的 TODO 事项，然后归档。\n`);
      process.stderr.write(`归档后可开始新需求。\n`);
      process.exit(2);
    }

    // Phase 4.6: change-requested — 允许项目内文件写入
    if (stage === 'change-requested') {
      process.exit(0);
    }

    // Phase 4.7: archived stage — 全部完成，放行（引导新需求）
    if (stage === 'archived') {
      process.exit(0);
    }

    // Phase 5: IN scope check (existing logic)
    let specContent = '';
    try {
      specContent = fs.readFileSync(specPath, 'utf8');
    } catch (_) {
      process.stderr.write(`BLOCKED: cannot read focus-spec.md, tool=${tool}, file=${normalizedFile}\n`);
      process.exit(2);
    }

    const inPatterns = [];
    const lines = specContent.split('\n');
    for (const line of lines) {
      const match = line.match(/^IN:\s*(.+)$/);
      if (match) {
        const raw = match[1].trim();
        inPatterns.push(raw.replace(/[（(][^）)]*[）)]\s*$/, '').trim());
      }
    }

    if (inPatterns.length === 0) {
      process.stderr.write(`BLOCKED: focus-spec has no IN scope defined, tool=${tool}, file=${normalizedFile}\n`);
      process.stderr.write('Run pmcp new-requirement to start a new task, or add IN: patterns to focus-spec.md.\n');
      process.exit(2);
    }

    if (inPatterns.includes('*')) {
      process.exit(0);
    }

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
      process.stderr.write(`BLOCKED: 此文件不在当前 focus-spec 范围内, tool=${tool}, file=${normalizedFile}\n`);
      process.stderr.write(`Allowed scope: ${inPatterns.join(', ')}\n`);
      process.stderr.write('如属新需求，请运行 pmcp new-requirement。\n');
      process.exit(2);
    }

    process.exit(0);
  } catch (_) {
    process.exit(0);
  }
});
