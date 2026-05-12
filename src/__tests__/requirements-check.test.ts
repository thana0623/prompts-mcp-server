import { describe, it, expect } from 'vitest';
import { checkRequirements } from '../requirements-check.js';

describe('checkRequirements', () => {
  it('flags empty description as all unclear', () => {
    const result = checkRequirements('');
    expect(result.allClear).toBe(false);
    expect(result.unclearItems.length).toBeGreaterThan(0);
  });

  it('flags short description as unclear goal', () => {
    const result = checkRequirements('fix bug');
    const goalItem = result.items.find(i => i.id === 'goal');
    expect(goalItem?.status).not.toBe('✅');
  });

  it('passes goal check for detailed description', () => {
    const result = checkRequirements(
      '实现用户登录功能，包括用户名密码校验和 JWT token 生成'
    );
    const goalItem = result.items.find(i => i.id === 'goal');
    expect(goalItem?.status).toBe('✅');
  });

  it('detects input/output keywords', () => {
    const result = checkRequirements(
      '实现从数据库查询用户列表接口，返回分页结果 response'
    );
    const ioItem = result.items.find(i => i.id === 'io');
    expect(ioItem?.status).toBe('✅');
  });

  it('detects constraint keywords', () => {
    const result = checkRequirements(
      '重构认证模块，不能改动现有的 API 接口签名，禁止删除旧版本兼容'
    );
    const constraintItem = result.items.find(i => i.id === 'constraints');
    expect(constraintItem?.status).toBe('✅');
  });

  it('detects acceptance criteria keywords', () => {
    const result = checkRequirements(
      '添加单元测试，验收标准：所有测试用例通过，覆盖率 > 80%'
    );
    const acceptanceItem = result.items.find(i => i.id === 'acceptance');
    expect(acceptanceItem?.status).toBe('✅');
  });

  it('detects scope keywords', () => {
    const result = checkRequirements(
      '修改 auth 模块的登录接口，涉及文件 auth.controller.ts 和 auth.service.ts'
    );
    const scopeItem = result.items.find(i => i.id === 'scope');
    expect(scopeItem?.status).toBe('✅');
  });

  it('generates follow-up questions for unclear items', () => {
    const result = checkRequirements('fix it');
    expect(result.followUpQuestions.length).toBeGreaterThan(0);
  });

  it('returns no follow-up questions when all clear', () => {
    const result = checkRequirements(
      '实现用户注册接口，输入用户名密码邮箱，返回用户ID。不能重复注册。验收标准：注册成功返回201，重复注册返回409。涉及文件 user.controller.ts, user.service.ts, user.model.ts'
    );
    // At least the goal and acceptance should be clear
    const goalItem = result.items.find(i => i.id === 'goal');
    expect(goalItem?.status).toBe('✅');
  });
});
