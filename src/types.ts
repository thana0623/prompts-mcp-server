import { z } from "zod";

export const PromptArgumentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional().default(false),
});

export const PromptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  template: z.string().min(1),
  arguments: z.array(PromptArgumentSchema).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreatePromptInputSchema = z.object({
  name: z.string().min(1).describe("Human-readable name for the prompt"),
  description: z.string().optional().describe("Optional description of what this prompt does"),
  template: z.string().min(1).describe("The prompt template text. Use {{argument_name}} for placeholders"),
  arguments: z
    .array(PromptArgumentSchema)
    .optional()
    .default([])
    .describe("List of arguments that can be substituted into the template"),
  tags: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Tags for categorising and filtering prompts"),
});

export const UpdatePromptInputSchema = z.object({
  id: z.string().min(1).describe("ID of the prompt to update"),
  name: z.string().min(1).optional().describe("New name for the prompt"),
  description: z.string().optional().describe("New description"),
  template: z.string().min(1).optional().describe("New template text"),
  arguments: z.array(PromptArgumentSchema).optional().describe("New argument definitions"),
  tags: z.array(z.string()).optional().describe("New tags"),
});

export const DeletePromptInputSchema = z.object({
  id: z.string().min(1).describe("ID of the prompt to delete"),
});

export const ListPromptsInputSchema = z.object({
  tag: z.string().optional().describe("Filter prompts by tag"),
  search: z.string().optional().describe("Search prompts by name or description"),
});

export const GetPromptInputSchema = z.object({
  id: z.string().min(1).describe("ID of the prompt to retrieve"),
  arguments: z
    .record(z.string())
    .optional()
    .default({})
    .describe("Argument values to substitute into the template"),
});

export type PromptArgument = z.infer<typeof PromptArgumentSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type CreatePromptInput = z.infer<typeof CreatePromptInputSchema>;
export type UpdatePromptInput = z.infer<typeof UpdatePromptInputSchema>;
export type DeletePromptInput = z.infer<typeof DeletePromptInputSchema>;
export type ListPromptsInput = z.infer<typeof ListPromptsInputSchema>;
export type GetPromptInput = z.infer<typeof GetPromptInputSchema>;

export interface PromptsStore {
  list(filter?: { tag?: string; search?: string }): Promise<Prompt[]>;
  get(id: string): Promise<Prompt | undefined>;
  getByName(name: string): Promise<Prompt | undefined>;
  create(input: CreatePromptInput): Promise<Prompt>;
  update(input: UpdatePromptInput): Promise<Prompt>;
  delete(id: string): Promise<boolean>;
}
