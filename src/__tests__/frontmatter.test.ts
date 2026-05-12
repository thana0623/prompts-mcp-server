import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses standard frontmatter', () => {
    const input = `---
name: my-skill
icon: 🎯
description: test skill
version: 1
---

## 身份

测试内容`;
    const result = parseFrontmatter(input);
    expect(result.meta).toEqual({
      name: 'my-skill',
      icon: '🎯',
      description: 'test skill',
      version: '1',
    });
    expect(result.body).toContain('## 身份');
    expect(result.body).toContain('测试内容');
  });

  it('handles value containing colons', () => {
    const input = `---
name: test
description: http://example.com:8080/path
---

body`;
    const result = parseFrontmatter(input);
    expect(result.meta.description).toBe('http://example.com:8080/path');
  });

  it('returns raw body when no frontmatter', () => {
    const input = `# Just a heading

Some content without frontmatter.`;
    const result = parseFrontmatter(input);
    expect(result.meta).toEqual({});
    expect(result.body).toContain('# Just a heading');
  });

  it('handles empty frontmatter', () => {
    const input = `---
---

body content`;
    const result = parseFrontmatter(input);
    expect(result.meta).toEqual({});
    expect(result.body).toBe('body content');
  });

  it('trims whitespace from keys and values', () => {
    const input = `---
  name  :  spaced-value
---

body`;
    const result = parseFrontmatter(input);
    expect(result.meta['name']).toBe('spaced-value');
  });

  it('skips lines without colons', () => {
    const input = `---
name: test
not-a-key-value
icon: 🎯
---

body`;
    const result = parseFrontmatter(input);
    expect(result.meta.name).toBe('test');
    expect(result.meta.icon).toBe('🎯');
    expect(Object.keys(result.meta)).toHaveLength(2);
  });
});
