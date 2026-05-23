import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
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

function setState(stage: string, taskId = 'test') {
  fs.writeFileSync(STATE_PATH, JSON.stringify({ stage, taskId, history: [] }));
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
    setState('confirmed');
    setSpecWithIn(['src/api/**', 'src/models/**']);
    const result = runHook('Write', 'src/frontend/Button.tsx');
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain('不在当前 focus-spec 范围内');
  });

  // 断言 2: 范围内放行
  it('allows Write inside IN scope when confirmed', () => {
    setState('confirmed');
    setSpecWithIn(['src/api/**', 'src/models/**']);
    const result = runHook('Write', 'src/api/users.ts');
    expect(result.exit).toBe(0);
  });

  // 断言 3: 目录级通配深路径
  it('allows Write in deeply nested path matching glob', () => {
    setState('confirmed');
    setSpecWithIn(['src/api/**']);
    const result = runHook('Write', 'src/api/v2/deep/nested.ts');
    expect(result.exit).toBe(0);
  });

  // 断言 4: Fast-Track * 无限制
  it('allows Write anywhere when IN is *', () => {
    setState('confirmed');
    setSpecWithIn(['*']);
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
    setState('confirmed');
    execSync('node build/cli.js new-requirement', { cwd: PROJECT_DIR, stdio: 'pipe' });
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    expect(state.stage).toBe('spec-pending');
    expect(state.history[state.history.length - 1].stage).toBe('spec-pending');
  });

  // 断言 8: 重置后拦截生效
  it('blocks Write after new-requirement reset', () => {
    setState('confirmed');
    execSync('node build/cli.js new-requirement', { cwd: PROJECT_DIR, stdio: 'pipe' });
    const result = runHook('Write', 'src/anything.ts');
    expect(result.exit).toBe(2);
  });

  // 断言 9: 无 IN 行阻止所有
  it('blocks all Writes when no IN lines in focus-spec', () => {
    setState('confirmed');
    const content = `> task-id: test\n> status: confirmed\n\n## 1. 场景还原\nTest\n\n## 2. 核心业务边界\n(no scope defined)\n\n## 3. 禁止触碰黑名单\n- none\n\n## 4. 核心测试断言清单\nassertCompilePass()\n`;
    fs.writeFileSync(SPEC_PATH, content);
    const result = runHook('Write', 'src/test.ts');
    expect(result.exit).toBe(2);
  });

  // 断言 10: 多路径 Edit 匹配
  it('allows Edit matching second IN pattern', () => {
    setState('confirmed');
    setSpecWithIn(['src/api/**', 'src/utils/**']);
    const result = runHook('Edit', 'src/utils/helper.ts');
    expect(result.exit).toBe(0);
  });
});
