import type { Prompt } from "./types.js";

const PLACEHOLDER_RE = /\{\{(\s*[\w.]+\s*)\}\}/g;

/**
 * Substitutes `{{argument_name}}` placeholders in a template string.
 * @param template  The prompt template text.
 * @param args      Map of argument name → value.
 * @returns The resolved string with all known placeholders replaced.
 */
export function resolveTemplate(
  template: string,
  args: Record<string, string>
): string {
  return template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const key = name.trim();
    return key in args ? args[key] : `{{${key}}}`;
  });
}

/**
 * Converts an internal Prompt to the MCP `GetPromptResult` messages format,
 * optionally substituting argument values into the template.
 */
export function promptToMcpMessages(
  prompt: Prompt,
  args: Record<string, string> = {}
): Array<{ role: "user" | "assistant"; content: { type: "text"; text: string } }> {
  const text = resolveTemplate(prompt.template, args);
  return [{ role: "user", content: { type: "text", text } }];
}
