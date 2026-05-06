import { randomUUID } from "crypto";
import {
  type CreatePromptInput,
  type UpdatePromptInput,
  type Prompt,
  type PromptsStore,
  PromptSchema,
} from "./types.js";

/**
 * In-memory implementation of PromptsStore.
 * Prompts are kept in a Map and can be optionally seeded from an initial list.
 */
export class InMemoryPromptsStore implements PromptsStore {
  private readonly prompts = new Map<string, Prompt>();

  constructor(initial: Prompt[] = []) {
    for (const prompt of initial) {
      this.prompts.set(prompt.id, prompt);
    }
  }

  async list(filter?: { tag?: string; search?: string }): Promise<Prompt[]> {
    let results = Array.from(this.prompts.values());

    if (filter?.tag) {
      const tag = filter.tag.toLowerCase();
      results = results.filter((p) => p.tags?.some((t) => t.toLowerCase() === tag));
    }

    if (filter?.search) {
      const query = filter.search.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description ?? "").toLowerCase().includes(query)
      );
    }

    // Return sorted by name for stable ordering
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Prompt | undefined> {
    return this.prompts.get(id);
  }

  async getByName(name: string): Promise<Prompt | undefined> {
    const lower = name.toLowerCase();
    for (const prompt of this.prompts.values()) {
      if (prompt.name.toLowerCase() === lower) {
        return prompt;
      }
    }
    return undefined;
  }

  async create(input: CreatePromptInput): Promise<Prompt> {
    const now = new Date().toISOString();
    const prompt = PromptSchema.parse({
      id: randomUUID(),
      name: input.name,
      description: input.description,
      template: input.template,
      arguments: input.arguments ?? [],
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    });
    this.prompts.set(prompt.id, prompt);
    return prompt;
  }

  async update(input: UpdatePromptInput): Promise<Prompt> {
    const existing = this.prompts.get(input.id);
    if (!existing) {
      throw new Error(`Prompt not found: ${input.id}`);
    }

    const updated = PromptSchema.parse({
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.template !== undefined && { template: input.template }),
      ...(input.arguments !== undefined && { arguments: input.arguments }),
      ...(input.tags !== undefined && { tags: input.tags }),
      updatedAt: new Date().toISOString(),
    });

    this.prompts.set(updated.id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.prompts.delete(id);
  }
}
