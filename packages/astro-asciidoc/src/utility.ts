import { parseFrontmatter } from "@astrojs/markdown-remark";

/**
 * Parse AsciiDoc frontmatter using Astro's built-in parser.
 * Supports YAML front matter between "---" delimiters and AsciiDoc attributes.
 */
export function parseAdocFrontmatter(contents: string): {
  frontmatter: Record<string, any>;
  body: string;
  rawFrontmatter?: string;
} {
  // Use Astro's built-in frontmatter parser for YAML
  const {frontmatter, content, rawFrontmatter} = parseFrontmatter(contents, { frontmatter: "remove" });

  // Parse remaining AsciiDoc-specific attributes from the content
  const lines = content.split(/\r?\n/);
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
  if (rawFrontmatter) {
    rawParts.push(rawFrontmatter);
  }
  if (additionalAttrs.length > 0) {
    rawParts.push(additionalAttrs.join("\n"));
  }

  return {
    frontmatter,
    body : content,
    rawFrontmatter: rawParts.join("\n").trim() || undefined,
  };
}