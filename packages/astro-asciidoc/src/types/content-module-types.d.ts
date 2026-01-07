// declare module 'astro:content' {
// 	interface Render {
// 		'.mdx': Promise<{
// 			Content: import('astro').MDXContent;
// 			headings: import('astro').MarkdownHeading[];
// 			remarkPluginFrontmatter: Record<string, any>;
// 			components: import('astro').MDXInstance<{}>['components'];
// 		}>;
// 	}
// }

declare module 'astro:content' {
	interface Render {
		'.adoc': Promise<{
			Content: import('astro').MDXContent;
			headings: import('astro').MarkdownHeading[];
			remarkPluginFrontmatter: Record<string, any>;
			components: import('astro').MDXInstance<{}>['components'];
		}>;
	}
}

// // Generated types for AsciiDoc content modules
// export const file: string;
// export const title: string;
// export const frontmatter: Record<string, any>;
// export const headings: any[];
// export async function getHeadings(): Promise<any[]>;
// export async function Content(): Promise<any>;
// declare const _default: typeof Content;
// export default _default;