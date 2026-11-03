/**
 * The legal pages' storage format.
 *
 * The refund, privacy and terms pages used to be JSX, which meant a typo in
 * the refund policy was a code change and a deploy. They are now rows an admin
 * edits, which raises the question of what the body is made of.
 *
 * It is not HTML, and not markdown. HTML authored in a panel and served to
 * every student is an injection surface that has to be sanitised, and markdown
 * would mean adding a parser and a sanitiser to the project -- two
 * dependencies for three pages. Instead the body is plain text in a small
 * fixed syntax, parsed here into blocks that React renders as text. Nothing
 * an admin types can become markup, because no path exists for it to.
 *
 * The syntax, in full:
 *
 *   ## Heading              a section heading
 *   - item                  a bullet; consecutive lines form one list
 *   blank line              separates blocks
 *   **bold**                emphasis, inline
 *   [label](/path)          a link, inline
 *   {{support_email}}       the current support address, as a mailto link
 *
 * Anything else is a paragraph. A line that looks like none of the above is
 * never an error -- it is text, which is what an admin expects of a text box.
 */

export const LEGAL_SLUGS = ["refund-policy", "privacy-policy", "terms"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_TITLES: Record<LegalSlug, string> = {
  "refund-policy": "Refund & Cancellation Policy",
  "privacy-policy": "Privacy Policy",
  terms: "Terms of Service",
};

export interface LegalSpan {
  text: string;
  bold?: boolean;
  href?: string;
}

export type LegalBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; spans: LegalSpan[] }
  | { kind: "list"; items: LegalSpan[][] };

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  effective_date: string;
  body: string;
  updated_at: string | null;
}

/**
 * Links are restricted to the three shapes a policy page has any business
 * containing. A `javascript:` or `data:` URL typed into the box is dropped and
 * its label kept as plain text, which is the safe reading of a mistake and the
 * only safe reading of an attack.
 */
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^mailto:[^\s<>]+@[^\s<>]+$/i.test(href)) return href;
  if (/^https:\/\/[^\s<>]+$/i.test(href)) return href;
  return null;
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Splits one line into spans, resolving tokens first so they can be linked. */
function parseInline(line: string, tokens: Record<string, string>): LegalSpan[] {
  // Tokens are substituted before the inline pass, so `{{support_email}}`
  // becomes a real mailto link rather than literal braces on the page.
  const resolved = line.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = tokens[name];
    if (!value) return match;
    return name.endsWith("_email") ? `[${value}](mailto:${value})` : value;
  });

  const spans: LegalSpan[] = [];
  let cursor = 0;

  for (const match of resolved.matchAll(INLINE)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      spans.push({ text: resolved.slice(cursor, index) });
    }

    if (match[1] !== undefined) {
      spans.push({ text: match[1], bold: true });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      const href = safeHref(match[3]);
      spans.push(href ? { text: match[2], href } : { text: match[2] });
    }

    cursor = index + match[0].length;
  }

  if (cursor < resolved.length) {
    spans.push({ text: resolved.slice(cursor) });
  }

  return spans.length > 0 ? spans : [{ text: resolved }];
}

export function parseLegalBody(
  source: string,
  tokens: Record<string, string> = {}
): LegalBlock[] {
  const blocks: LegalBlock[] = [];

  // Normalised first: a body round-tripped through a Windows textarea arrives
  // with CRLF, and a paragraph break would otherwise never match.
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" "), tokens) });
    paragraph = [];
  }

  function flushList() {
    if (list.length === 0) return;
    blocks.push({
      kind: "list",
      items: list.map((item) => parseInline(item, tokens)),
    });
    list = [];
  }

  for (const raw of lines) {
    const line = raw.trim();

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", text: line.slice(3).trim() });
      continue;
    }

    if (line.startsWith("- ")) {
      // A bullet ends the paragraph above it without needing a blank line,
      // because nobody types one there.
      flushParagraph();
      list.push(line.slice(2).trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

/** A one-line summary for the editor, so a saved document can be eyeballed. */
export function describeBlocks(blocks: LegalBlock[]): string {
  const headings = blocks.filter((block) => block.kind === "heading").length;
  const paragraphs = blocks.filter((block) => block.kind === "paragraph").length;
  const lists = blocks.filter((block) => block.kind === "list").length;

  const parts = [
    `${headings} heading${headings === 1 ? "" : "s"}`,
    `${paragraphs} paragraph${paragraphs === 1 ? "" : "s"}`,
    `${lists} list${lists === 1 ? "" : "s"}`,
  ];

  return parts.join(", ");
}
