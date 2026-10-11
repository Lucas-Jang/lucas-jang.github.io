import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { trainingSchema } from './lib/training';

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(), description: z.string(), date: z.coerce.date(),
    createdOrder: z.number().int().nonnegative().default(0),
    category: z.enum(['DEV', 'ENGLISH', 'BJJ', 'DIVE', 'DISTILL', 'LIFE']),
    postType: z.enum(['moment', 'journal', 'gallery', 'feature']).default('journal'),
    cover: z.string().optional(), coverAlt: z.string().default(''), featured: z.boolean().default(false),
    draft: z.boolean().default(false), tags: z.array(z.string()).default([]), location: z.string().optional(),
    subtitle: z.string().optional(), privateTitle: z.string().optional(), protected: z.boolean().default(false), protectedFile: z.string().optional(),
    gallery: z.array(z.object({ src: z.string(), alt: z.string(), caption: z.string().optional() })).default([]),
    video: z.string().url().optional(), training: trainingSchema.optional()
  })
});
export const collections = { posts };
