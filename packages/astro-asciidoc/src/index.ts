import type { ProcessorOptions } from "@asciidoctor/core";
import type { AstroIntegration } from "astro";
import type { ViteDevServer } from "vite";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import AsciidocConverter from "./asciidoctor.js";
import type { InitOptions } from "./worker.js";

type InternalHookParams = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:config:setup"]>
>[0] & {
  addPageExtension(ext: string): void;
  addContentEntryType?: (config: {
    extensions: string[];
    getEntryInfo: (params: { fileUrl: URL; contents: string }) => Promise<{
      data: Record<string, unknown>;
      body: string;
      slug?: string;
      rawData?: string;
    }>;
    contentModuleTypes?: string;
  }) => void;
};

/**
 * Options for AsciiDoc conversion.
 */
export interface Options extends InitOptions {
  /**
   * Options passed to Asciidoctor document load and document convert.
   */
  options?: ProcessorOptions;
}

/**
 * Parse AsciiDoc frontmatter using Astro's built-in parser.
 * Supports YAML front matter between "---" delimiters and AsciiDoc attributes.
 */
function parseAdocFrontmatter(contents: string): {
  frontmatter: Record<string, any>;
  body: string;
  rawFrontmatter?: string;
} {
  // Use Astro's built-in frontmatter parser for YAML
  const parsed = parseFrontmatter(contents, { frontmatter: "remove" });
  const frontmatter = parsed.frontmatter;

  // Parse remaining AsciiDoc-specific attributes from the content
  const lines = parsed.content.split(/\r?\n/);
  let bodyStartIndex = 0;
  const additionalAttrs: string[] = [];

  // Skip initial blank lines
  while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === "") {
    bodyStartIndex++;
  }

  // Title line: "= Title" (only if not already in YAML frontmatter)
  if (bodyStartIndex < lines.length && /^=\s+/.test(lines[bodyStartIndex])) {
    const titleLine = lines[bodyStartIndex].replace(/^=\s+/, "").trim();
    if (titleLine && !frontmatter.title) {
      frontmatter.title = titleLine;
    }
    bodyStartIndex++;
    // Consume any immediate blank lines after title
    while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim() === "") {
      bodyStartIndex++;
    }
  }

  // Attribute lines: ":key: value" at the top
  while (bodyStartIndex < lines.length) {
    const line = lines[bodyStartIndex];
    const trimmed = line.trim();
    if (trimmed === "") {
      bodyStartIndex++;
      continue;
    }
    const m = trimmed.match(/^:([^:]+):\s*(.*)$/);
    if (!m) break;
    const key = m[1].trim();
    const value = m[2].trim();
    frontmatter[key] = value;
    additionalAttrs.push(line);
    bodyStartIndex++;
  }

  // Combine raw frontmatter from YAML and additional attributes
  const rawParts: string[] = [];
  if (parsed.rawFrontmatter) {
    rawParts.push(parsed.rawFrontmatter);
  }
  if (additionalAttrs.length > 0) {
    rawParts.push(additionalAttrs.join("\n"));
  }

  return {
    frontmatter,
    body : parsed.content,
    rawFrontmatter: rawParts.join("\n").trim() || undefined,
  };
}

export default function asciidoc(opts?: Options): AstroIntegration {
  const asciidocFileExt = ".adoc";
  const { options: documentOptions, highlighters } = opts ?? {};
  const converter = new AsciidocConverter({
    highlighters,
  });
  let server: ViteDevServer;

  // Track which .adoc files depend on which include files
  const includeGraph = new Map<string, Set<string>>(); // includePath -> Set(adocFileId)
  let watcherInitialized = false;

  function initDevWatcherOnce() {
    if (watcherInitialized || !server) return;
    watcherInitialized = true;

    server.watcher.on("change", async (f) => {
      const dependents = includeGraph.get(f);
      if (!dependents || dependents.size === 0) return;

      for (const adocFile of dependents) {
        const m = server.moduleGraph.getModuleById(adocFile);
        if (m) await server.reloadModule(m);
      }
    });
  }

  function registerIncludesDev(adocFile: string, includes: string[]) {
    if (!server) return;

    for (const inc of includes) {
      let set = includeGraph.get(inc);
      if (!set) {
        set = new Set();
        includeGraph.set(inc, set);
      }
      set.add(adocFile);
    }

    initDevWatcherOnce();
  }

  return {
    name: "asciidoc",
    hooks: {
      "astro:config:setup": async (params) => {
        const { addPageExtension, addRenderer, updateConfig, addWatchFile, addContentEntryType, logger } =
          params as InternalHookParams;

        addRenderer({ name: "astro:mdx", serverEntrypoint: "@astrojs/mdx/server.js" });
        addPageExtension(asciidocFileExt);

        // Enable Content Collections support for .adoc files
        // if (addContentEntryType) {
          addContentEntryType({
            extensions: [asciidocFileExt],
            async getEntryInfo({ fileUrl, contents }) {
              const parsed = parseAdocFrontmatter(contents);
              return {
                data: parsed.frontmatter,
                body: parsed.body,
                slug: parsed.frontmatter?.slug,
                rawData: parsed.rawFrontmatter,
              };
            },
            // Minimal type declarations to satisfy Astro's module typing
            contentModuleTypes: `// Generated types for AsciiDoc content modules\nexport const file: string;\nexport const title: string;\nexport const frontmatter: Record<string, any>;\nexport const headings: any[];\nexport async function getHeadings(): Promise<any[]>;\nexport async function Content(): Promise<any>;\ndeclare const _default: typeof Content;\nexport default _default;`
          });
        // }

        updateConfig({
          vite: {
            plugins: [
              {
                name: "vite-plugin-astro-asciidoc",
                enforce: "pre",
                configureServer(s) {
                  server = s as ViteDevServer;
                },
                async transform(_code, id) {
                  if (!id.endsWith(asciidocFileExt)) return;

                  logger.info(`transform start: ${id} code: ${JSON.stringify(_code)}`);
                  logger.info(`transform start: ${id} documentOptions: ${JSON.stringify(documentOptions)}`);
                  const doc = await converter.convert({
                    file: id,
                    options: documentOptions,
                  });
                  logger.info(`transform done: ${id}`);

                  // Ensure Vite knows about included files in both dev and build
                  if (Array.isArray(doc.includes)) {
                    for (const inc of doc.includes) {
                      try {
                        this.addWatchFile(inc);
                      } catch {
                        // ignore errors
                      }
                      // Track for dev-time hot reloads
                      registerIncludesDev(id, [inc]);
                    }
                  }

                  return {
                    code: `import { Fragment, jsx as h } from "astro/jsx-runtime";
${doc.layout ? `import Layout from ${JSON.stringify(doc.layout)};` : ""}
export const file = ${JSON.stringify(id)};
export const title = ${JSON.stringify(doc.frontmatter.title)};
export const frontmatter = ${JSON.stringify(doc.frontmatter)};
export const headings = ${JSON.stringify(doc.headings)};
export async function getHeadings() { return headings; }
export async function Content() {
  const content = h(Fragment, { "set:html": ${JSON.stringify(doc.html)} });
  ${
    doc.layout
      ? `return h(Layout, { title, headings, frontmatter, children: content });`
      : `return content;`
  }
}
export default Content;`,
                    meta: {
                      vite: {
                        lang: "ts",
                      },
                    },
                    map: null,
                  };
                },
              },
            ],
          },
        });

        addWatchFile(new URL(import.meta.url));
      },
      // Ensure we terminate the worker in all cases
      "astro:config:done": () => {},
      "astro:server:done": async () => {
        await converter.terminate();
      },
      "astro:build:done": async () => {
        await converter.terminate();
      },
    },
  };
}
