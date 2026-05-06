import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryPromptsStore } from "../store.js";
import type { Prompt } from "../types.js";

describe("InMemoryPromptsStore", () => {
  let store: InMemoryPromptsStore;

  beforeEach(() => {
    store = new InMemoryPromptsStore();
  });

  describe("create", () => {
    it("creates a prompt with generated id and timestamps", async () => {
      const prompt = await store.create({
        name: "My Prompt",
        template: "Hello, {{name}}!",
        arguments: [{ name: "name", required: true }],
        tags: ["greeting"],
      });

      expect(prompt.id).toBeTruthy();
      expect(prompt.name).toBe("My Prompt");
      expect(prompt.template).toBe("Hello, {{name}}!");
      expect(prompt.arguments).toHaveLength(1);
      expect(prompt.tags).toEqual(["greeting"]);
      expect(prompt.createdAt).toBeTruthy();
      expect(prompt.updatedAt).toBeTruthy();
    });

    it("creates a prompt with minimal fields", async () => {
      const prompt = await store.create({ name: "Simple", template: "Do the thing." });
      expect(prompt.arguments).toEqual([]);
      expect(prompt.tags).toEqual([]);
      expect(prompt.description).toBeUndefined();
    });
  });

  describe("get", () => {
    it("returns a prompt by id", async () => {
      const created = await store.create({ name: "A", template: "T" });
      const found = await store.get(created.id);
      expect(found).toEqual(created);
    });

    it("returns undefined for unknown id", async () => {
      expect(await store.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getByName", () => {
    it("returns a prompt by exact name (case-insensitive)", async () => {
      const created = await store.create({ name: "My Prompt", template: "T" });
      expect(await store.getByName("my prompt")).toEqual(created);
      expect(await store.getByName("MY PROMPT")).toEqual(created);
    });

    it("returns undefined for unknown name", async () => {
      expect(await store.getByName("ghost")).toBeUndefined();
    });
  });

  describe("list", () => {
    let p1: Prompt, p2: Prompt, p3: Prompt;

    beforeEach(async () => {
      p1 = await store.create({ name: "Alpha", template: "A", tags: ["code"] });
      p2 = await store.create({ name: "Beta", template: "B", tags: ["code", "review"], description: "A code reviewer" });
      p3 = await store.create({ name: "Gamma", template: "G", tags: ["writing"] });
    });

    it("lists all prompts sorted by name", async () => {
      const all = await store.list();
      expect(all.map((p) => p.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    });

    it("filters by tag", async () => {
      const codePrompts = await store.list({ tag: "code" });
      expect(codePrompts).toHaveLength(2);
      expect(codePrompts.map((p) => p.name)).toContain("Alpha");
      expect(codePrompts.map((p) => p.name)).toContain("Beta");
    });

    it("filters by tag (case-insensitive)", async () => {
      const results = await store.list({ tag: "CODE" });
      expect(results).toHaveLength(2);
    });

    it("filters by search query against name", async () => {
      const results = await store.list({ search: "alp" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Alpha");
    });

    it("filters by search query against description", async () => {
      const results = await store.list({ search: "reviewer" });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Beta");
    });
  });

  describe("update", () => {
    it("updates specified fields", async () => {
      const original = await store.create({ name: "Old Name", template: "Old template" });
      const updated = await store.update({ id: original.id, name: "New Name" });

      expect(updated.name).toBe("New Name");
      expect(updated.template).toBe("Old template");
      expect(updated.id).toBe(original.id);
      expect(updated.createdAt).toBe(original.createdAt);
      expect(new Date(updated.updatedAt) >= new Date(original.updatedAt)).toBe(true);
    });

    it("throws if prompt does not exist", async () => {
      await expect(store.update({ id: "bad-id", name: "X" })).rejects.toThrow(
        "Prompt not found: bad-id"
      );
    });
  });

  describe("delete", () => {
    it("deletes an existing prompt and returns true", async () => {
      const prompt = await store.create({ name: "Gone", template: "T" });
      expect(await store.delete(prompt.id)).toBe(true);
      expect(await store.get(prompt.id)).toBeUndefined();
    });

    it("returns false for non-existent id", async () => {
      expect(await store.delete("missing")).toBe(false);
    });
  });
});
