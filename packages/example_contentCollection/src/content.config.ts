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
  })
});

const blog2 = defineCollection({
  loader: async () => {
    const response = await fetch("https://raw.githubusercontent.com/opendevise/asciidoc-samples/refs/heads/main/demo.adoc");
    const data = await response.blob();
    // Must return an array of entries with an id property, or an object with IDs as keys and entries as values
    return {
      'demo.adoc': {
        body: await data.text(),
      }
    };
  },
  schema: z.object({
    title: z.string(),
  })
});

// 5. Export a single `collections` object to register your collection(s)
export const collections = { blog, blog2 };