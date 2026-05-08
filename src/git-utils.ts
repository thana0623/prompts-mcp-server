/**
 * git-utils.ts
 *
 * Git 操作工具模块。
 * 提供 add / commit / status 等基础 git 操作。
 */

import { execSync } from 'node:child_process';
import { config } from './config.js';

export interface GitCommitResult {
  success: boolean;
  hash?: string;
  message?: string;
  error?: string;
}

export interface GitStatusResult {
  branch: string;
  changed: string[];
  staged: string[];
}

/**
 * 检查当前目录是否为 git 仓库
 */
export function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: config.projectRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 git status
 */
export function gitStatus(): GitStatusResult | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: config.projectRoot,
      encoding: 'utf-8',
    }).trim();

    const status = execSync('git status --porcelain', {
      cwd: config.projectRoot,
      encoding: 'utf-8',
    });

    const changed: string[] = [];
    const staged: string[] = [];

    for (const line of status.split('\n')) {
      if (!line.trim()) continue;
      const indexStatus = line.slice(0, 2);
      const file = line.slice(3);
      if (indexStatus[0] !== ' ' && indexStatus[0] !== '?') {
        staged.push(file);
      }
      changed.push(file);
    }

    return { branch, changed, staged };
  } catch {
    return null;
  }
}

/**
 * git add 文件
 */
export function gitAdd(patterns: string[]): boolean {
  try {
    const args = patterns.length > 0 ? patterns.map(p => `"${p}"`).join(' ') : '-A';
    execSync(`git add ${args}`, {
      cwd: config.projectRoot,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * git commit
 */
export function gitCommit(message: string): GitCommitResult {
  try {
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: config.projectRoot,
      encoding: 'utf-8',
    });

    const hash = execSync('git rev-parse --short HEAD', {
      cwd: config.projectRoot,
      encoding: 'utf-8',
    }).trim();

    return { success: true, hash, message };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

/**
 * 一键 add + commit
 */
export function gitAutoCommit(message: string, files?: string[]): GitCommitResult {
  if (!isGitRepo()) {
    return { success: false, error: '当前目录不是 git 仓库' };
  }

  const staged = gitAdd(files || []);
  if (!staged) {
    return { success: false, error: 'git add 失败' };
  }

  return gitCommit(message);
}
