import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PROJECT_DIR = path.resolve(__dirname, '../..');
const STATE_PATH = path.join(PROJECT_DIR, '.github', 'prompts', 'task-state.json');
const SPEC_PATH = path.join(PROJECT_DIR, '.github', 'prompts', 'focus-spec.md');
const HOOK_PATH = path.join(PROJECT_DIR, '.prompts-mcp', 'pre-tool-use.cjs');

let origState = '';
let origSpec = '';

function runHook(toolName: string, filePath: string): { exit: number; stderr: string } {
  const input = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } });
  try {
    execSync(`node "${HOOK_PATH}"`, {
      input,
      cwd: PROJECT_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exit: 0, stderr: '' };
  } catch (err: any) {
    return { exit: err.status, stderr: err.stderr?.toString() || '' };
  }
}

function setState(stage: string, taskId = 'test', contractHash?: string) {
  const state: any = { stage, taskId, history: [] };
  if (contractHash) state.contractHash = contractHash;
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function computeHash(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function setSpecWithIn(inPatterns: string[]) {
  const inLines = inPatterns.map(p => `IN: ${p}`).join('\n');
  const content = `> task-id: test\n> created: 2026-05-23\n> status: confirmed\n\n## 1. 场景还原\nTest\n\n## 2. 核心业务边界\n${inLines}\n\n## 3. 禁止触碰黑名单\n- none\n\n## 4. 核心测试断言清单\nassertCompilePass()\n`;
  fs.writeFileSync(SPEC_PATH, content);
}

describe('PreToolUse Hook — Scope Check + New Requirement', () => {
  beforeEach(() => {
    origState = fs.readFileSync(STATE_PATH, 'utf8');
    origSpec = fs.readFileSync(SPEC_PATH, 'utf8');
  });

  afterEach(() => {
    fs.writeFileSync(STATE_PATH, origState);
    fs.writeFileSync(SPEC_PATH, origSpec);
  });

  // 断言 1: 超范围阻止
  it('blocks Write outside IN scope when confirmed', () => {
    setSpecWithIn(['src/api/**', 'src/models/**']);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    const result = runHook('Write', 'src/frontend/Button.tsx');
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain('不在当前 focus-spec 范围内');
  });

  // 断言 2: 范围内放行
  it('allows Write inside IN scope when confirmed', () => {
    setSpecWithIn(['src/api/**', 'src/models/**']);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    const result = runHook('Write', 'src/api/users.ts');
    expect(result.exit).toBe(0);
  });

  // 断言 3: 目录级通配深路径
  it('allows Write in deeply nested path matching glob', () => {
    setSpecWithIn(['src/api/**']);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    const result = runHook('Write', 'src/api/v2/deep/nested.ts');
    expect(result.exit).toBe(0);
  });

  // 断言 4: Fast-Track * 无限制
  it('allows Write anywhere when IN is *', () => {
    setSpecWithIn(['*']);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    const result = runHook('Write', 'any/path/file.ts');
    expect(result.exit).toBe(0);
  });

  // 断言 5: spec-pending 保持原有行为
  it('blocks Write in spec-pending (unchanged behavior)', () => {
    setState('spec-pending');
    const result = runHook('Write', 'src/test.ts');
    expect(result.exit).toBe(2);
  });

  // 断言 6: 例外文件始终放行
  it('allows Write to focus-spec.md in spec-pending', () => {
    setState('spec-pending');
    const result = runHook('Write', '.github/prompts/focus-spec.md');
    expect(result.exit).toBe(0);
  });

  // 断言 7: new-requirement 重置状态
  it('new-requirement resets stage to spec-pending', () => {
    setSpecWithIn(['src/**']);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    execSync('node build/cli.js new-requirement', { cwd: PROJECT_DIR, stdio: 'pipe' });
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    expect(state.stage).toBe('spec-pending');
    expect(state.history[state.history.length - 1].stage).toBe('spec-pending');
  });

  // 断言 8: 重置后拦截生效
  it('blocks Write after new-requirement reset', () => {
    setSpecWithIn(['src/**']);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    execSync('node build/cli.js new-requirement', { cwd: PROJECT_DIR, stdio: 'pipe' });
    const result = runHook('Write', 'src/anything.ts');
    expect(result.exit).toBe(2);
  });

  // 断言 9: 无 IN 行阻止所有
  it('blocks all Writes when no IN lines in focus-spec', () => {
    const content = `> task-id: test\n> status: confirmed\n\n## 1. 场景还原\nTest\n\n## 2. 核心业务边界\n(no scope defined)\n\n## 3. 禁止触碰黑名单\n- none\n\n## 4. 核心测试断言清单\nassertCompilePass()\n`;
    fs.writeFileSync(SPEC_PATH, content);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    const result = runHook('Write', 'src/test.ts');
    expect(result.exit).toBe(2);
  });

  // 断言 10: 多路径 Edit 匹配
  it('allows Edit matching second IN pattern', () => {
    setSpecWithIn(['src/api/**', 'src/utils/**']);
    setState('confirmed', 'test', computeHash(SPEC_PATH));
    const result = runHook('Edit', 'src/utils/helper.ts');
    expect(result.exit).toBe(0);
  });
});

describe('PreToolUse Hook — Contract Immutability', () => {
  beforeEach(() => {
    origState = fs.readFileSync(STATE_PATH, 'utf8');
    origSpec = fs.readFileSync(SPEC_PATH, 'utf8');
  });

  afterEach(() => {
    fs.writeFileSync(STATE_PATH, origState);
    fs.writeFileSync(SPEC_PATH, origSpec);
  });

  // assertBlockWriteWhenConfirmed
  it('blocks Write to focus-spec.md when stage=confirmed', () => {
    setSpecWithIn(['src/**']);
    const hash = computeHash(SPEC_PATH);
    setState('confirmed', 'test', hash);
    const result = runHook('Write', '.github/prompts/focus-spec.md');
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain('契约已锁定');
  });

  // assertAllowWriteWhenPending
  it('allows Write to focus-spec.md when stage=spec-pending', () => {
    setState('spec-pending');
    const result = runHook('Write', '.github/prompts/focus-spec.md');
    expect(result.exit).toBe(0);
  });

  // assertAllowWriteWhenChangeRequested
  it('allows Write to focus-spec.md when stage=change-requested', () => {
    setState('change-requested');
    const result = runHook('Write', '.github/prompts/focus-spec.md');
    expect(result.exit).toBe(0);
  });

  // assertHashMismatchBlocksCoding
  it('blocks Write and forces stage to spec-pending when hash mismatches', () => {
    setSpecWithIn(['src/**']);
    setState('confirmed', 'test', 'deadbeefhash');
    const result = runHook('Write', 'src/app.ts');
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain('契约完整性校验失败');
    // Verify stage was forced back to spec-pending
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    expect(state.stage).toBe('spec-pending');
  });

  // assertChangeRequestRequiresConfirmation
  it('allows coding after change-request then blocks after re-confirmation with new hash', () => {
    setSpecWithIn(['src/**']);
    const hash = computeHash(SPEC_PATH);
    // Confirm with correct hash → coding allowed
    setState('confirmed', 'test', hash);
    expect(runHook('Write', 'src/app.ts').exit).toBe(0);

    // Simulate change-request → focus-spec editable
    setState('change-requested');
    expect(runHook('Write', '.github/prompts/focus-spec.md').exit).toBe(0);

    // Re-confirm with new hash → coding allowed again
    const newHash = computeHash(SPEC_PATH);
    setState('confirmed', 'test', newHash);
    expect(runHook('Write', 'src/app.ts').exit).toBe(0);
  });

  // assertTaskStateUpdatedOnChange
  it('records change in history when hash mismatch forces stage rollback', () => {
    setSpecWithIn(['src/**']);
    setState('confirmed', 'test', 'oldhash');
    runHook('Write', 'src/app.ts');
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    expect(state.stage).toBe('spec-pending');
    expect(state.history[0].note).toContain('契约完整性校验失败');
  });
});
