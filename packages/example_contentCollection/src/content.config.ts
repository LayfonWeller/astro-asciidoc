// 1. Import utilities from `astro:content`
import { defineCollection } from 'astro:content';

// 2. Import loader(s)
import { glob } from 'astro/loaders';

// 3. Import Zod
import { z } from 'astro/zod';

// 4. Define your collection(s)
const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.adoc", base: "./src/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
  })
});

const blog_no_layout = defineCollection({
  loader: glob({ pattern: "**/[^_]*.adoc", base: "./src/blog_no_layout" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
  })
});

// 5. Export a single `collections` object to register your collection(s)
export const collections = { blog, blog_no_layout };