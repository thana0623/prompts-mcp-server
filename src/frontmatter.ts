/**
 * frontmatter.ts
 *
 * 共享的 YAML frontmatter 解析器。
 * 从 markdown 文件中提取 --- 包裹的元数据和正文。
 */

export interface ParsedFrontmatter {
  meta: Record<string, string>;
  body: string;
}

/**
 * 解析包含 YAML frontmatter 的 markdown 文件
 *
 * @param raw - 原始文件内容
 * @returns meta（键值对）和 body（frontmatter 之后的正文）
 *
 * 支持：
 * - 标准 frontmatter 格式（--- 包裹）
 * - 值中包含冒号（只在第一个冒号处分割）
 * - 无 frontmatter 的文件（整个内容作为 body）
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const fmMatch = raw.match(/^---\n?([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!fmMatch) {
    return { meta: {}, body: raw.trim() };
  }

  const fmLines = fmMatch[1].split('\n');
  const meta: Record<string, string> = {};

  for (const line of fmLines) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) meta[key] = val;
    }
  }

  return { meta, body: fmMatch[2].trim() };
}
