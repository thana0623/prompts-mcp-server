import { describe, it, expect } from "vitest";
import { resolveTemplate, promptToMcpMessages } from "../template.js";
import type { Prompt } from "../types.js";

describe("resolveTemplate", () => {
  it("substitutes simple placeholders", () => {
    expect(resolveTemplate("Hello, {{name}}!", { name: "World" })).toBe("Hello, World!");
  });

  it("substitutes multiple distinct placeholders", () => {
    expect(
      resolveTemplate("Dear {{title}} {{last_name}},", { title: "Dr.", last_name: "Smith" })
    ).toBe("Dear Dr. Smith,");
  });

  it("substitutes the same placeholder multiple times", () => {
    expect(resolveTemplate("{{x}} and {{x}}", { x: "foo" })).toBe("foo and foo");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(resolveTemplate("Hello, {{name}}!", {})).toBe("Hello, {{name}}!");
  });

  it("handles placeholders with surrounding whitespace", () => {
    expect(resolveTemplate("{{ name }}", { name: "Ada" })).toBe("Ada");
  });

  it("returns template unchanged when args is empty", () => {
    const tmpl = "No placeholders here.";
    expect(resolveTemplate(tmpl, {})).toBe(tmpl);
  });
});

describe("promptToMcpMessages", () => {
  const basePrompt: Prompt = {
    id: "test-id",
    name: "Test",
    template: "Write a {{type}} about {{topic}}.",
    arguments: [
      { name: "type", required: true },
      { name: "topic", required: true },
    ],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("returns a single user message with resolved template", () => {
    const messages = promptToMcpMessages(basePrompt, { type: "poem", topic: "rain" });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content.text).toBe("Write a poem about rain.");
  });

  it("leaves unresolved placeholders when no args provided", () => {
    const messages = promptToMcpMessages(basePrompt);
    expect(messages[0].content.text).toBe("Write a {{type}} about {{topic}}.");
  });
});
