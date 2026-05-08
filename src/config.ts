/**
 * config.ts
 *
 * 集中管理所有可配置项，从 .env 文件和环境变量中读取。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── .env 加载 ────────────────────────────────────────────────────────

function loadEnv(): void {
  // 如果通过 --env-file 已经加载，跳过
  if (process.env._ENV_LOADED) return;

  const envPath = path.resolve(process.cwd(), '.env');
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env 不存在，忽略
  }
}

loadEnv();

// ─── 配置项 ───────────────────────────────────────────────────────────

export const config = {
  /** 目标项目根目录 */
  projectRoot: process.env.PROJECT_ROOT || process.cwd(),

  /** prompts 文件存放的子目录（相对于项目根目录） */
  promptsSubDir: process.env.PROMPTS_SUBDIR || '.github/prompts',

  /** AI 助手类型 */
  assistant: process.env.ASSISTANT || 'claude-code',

  /** MCP Server 名称 */
  serverName: process.env.MCP_SERVER_NAME || 'prompts-mcp-server',

  /** MCP Server 版本 */
  serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',

  /** 是否在 log_dialog 后自动 git commit（默认开启） */
  autoCommit: process.env.AUTO_COMMIT !== 'false',
};

// ─── 路径辅助函数 ─────────────────────────────────────────────────────

export function getProjectRoot(): string {
  return config.projectRoot;
}

export function getPromptsDir(): string {
  return path.join(config.projectRoot, config.promptsSubDir);
}

export function getModulesDir(projectRoot?: string): string {
  const root = projectRoot || config.projectRoot;
  return path.join(root, config.promptsSubDir, 'modules');
}
