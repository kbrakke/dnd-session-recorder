import { z } from 'zod';

export const campaignSchema = z.object({
  name: z
    .string()
    .min(1, 'Campaign name is required')
    .max(100, 'Campaign name must be less than 100 characters'),

  description: z
    .string()
    .max(500, 'Description must be less than 500 characters'),

  systemPrompt: z
    .string()
    .max(2000, 'System prompt must be less than 2000 characters'),
});

export type CampaignFormData = z.infer<typeof campaignSchema>;
