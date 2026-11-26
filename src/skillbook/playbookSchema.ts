// @node: F9.1
// The strict schema for a playbook card and for the playbook.
import { z } from 'zod';

export type Level = 'simple' | 'practical' | 'deeper';

export const CardSchema = z.strictObject({
  id: z.string().regex(/^(?:concept|lesson|edge)\.[a-z0-9.-]+$/),
  kind: z.enum(['concept', 'check', 'sorting', 'edge_case']),
  title: z.string().min(3).max(80),
  summary: z.string().min(10).max(120),
  tags: z.array(z.string().regex(/^[a-z-]+$/)).min(1).max(8),
  keywords: z.array(z.string().min(2).max(30)).min(1).max(12),
  skillId: z.string().optional(),
  levels: z.strictObject({ simple: z.string().min(20), practical: z.string().min(20), deeper: z.string().min(20) }),
  related: z.array(z.string()).max(8),
});
export type Card = z.infer<typeof CardSchema>;

export const PlaybookSchema = z.strictObject({ version: z.literal(1), cards: z.array(CardSchema).min(1) });
export type Playbook = z.infer<typeof PlaybookSchema>;
