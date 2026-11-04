/**
 * A small Markdown to Atlassian Document Format converter for audit text. It covers what audit
 * reports use: paragraphs, headings, bullet and numbered lists, fenced code, inline code, bold,
 * italics and links. Anything else is kept as plain text, never dropped.
 */

export interface AdfMark {
  type: "code" | "strong" | "em" | "link";
  attrs?: { href: string };
}

export interface AdfText {
  type: "text";
  text: string;
  marks?: AdfMark[];
}

export interface AdfHardBreak {
  type: "hardBreak";
}

export type AdfInline = AdfText | AdfHardBreak;

export interface AdfParagraph {
  type: "paragraph";
  content?: AdfInline[];
}

export interface AdfHeading {
  type: "heading";
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content?: AdfInline[];
}

export interface AdfCodeBlock {
  type: "codeBlock";
  attrs?: { language: string };
  content?: AdfText[];
}

export interface AdfListItem {
  type: "listItem";
  content: AdfParagraph[];
}

export interface AdfList {
  type: "bulletList" | "orderedList";
  content: AdfListItem[];
}

export interface AdfRule {
  type: "rule";
}

export type AdfBlock = AdfParagraph | AdfHeading | AdfCodeBlock | AdfList | AdfRule;

export interface AdfDoc {
  type: "doc";
  version: 1;
  content: AdfBlock[];
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/g;

/** Inline Markdown to ADF text nodes. Unmatched markers stay as literal text. */
export function inline(text: string): AdfInline[] {
  const nodes: AdfText[] = [];
  const push = (value: string, marks?: AdfMark[]) => {
    if (!value) return;
    const node: AdfText = { type: "text", text: value };
    if (marks?.length) node.marks = marks;
    nodes.push(node);
  };

  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;
    push(text.slice(last, index));
    const token = match[0];
    if (match[1]) push(token.slice(1, -1), [{ type: "code" }]);
    else if (match[2]) push(token.slice(2, -2), [{ type: "strong" }]);
    else if (match[3]) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = link?.[2] ?? "";
      if (/^https?:\/\//.test(href)) push(link?.[1] ?? token, [{ type: "link", attrs: { href } }]);
      else push(token);
    } else push(token.slice(1, -1), [{ type: "em" }]);
    last = index + token.length;
  }
  push(text.slice(last));
  return nodes;
}

export function text(value: string, marks?: AdfMark[]): AdfText {
  const node: AdfText = { type: "text", text: value };
  if (marks?.length) node.marks = marks;
  return node;
}

export function paragraph(content: AdfInline[]): AdfParagraph {
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

export function heading(level: AdfHeading["attrs"]["level"], value: string): AdfHeading {
  return { type: "heading", attrs: { level }, content: [text(value)] };
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;

/** Block-level Markdown to ADF blocks. */
export function markdownToBlocks(markdown: string): AdfBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: AdfBlock[] = [];
  let para: string[] = [];
  let list: { type: AdfList["type"]; items: string[] } | undefined;

  const flushPara = () => {
    if (para.length) blocks.push(paragraph(inline(para.join(" ").trim())));
    para = [];
  };
  const flushList = () => {
    if (list?.items.length) {
      blocks.push({
        type: list.type,
        content: list.items.map((item) => ({
          type: "listItem",
          content: [paragraph(inline(item))],
        })),
      });
    }
    list = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const fence = FENCE.exec(line);
    if (fence) {
      flushPara();
      flushList();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      while (body.length && !body[body.length - 1]?.trim()) body.pop();
      const code = body.join("\n");
      const block: AdfCodeBlock = { type: "codeBlock" };
      if (fence[2]) block.attrs = { language: fence[2] };
      if (code) block.content = [text(code)];
      blocks.push(block);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }

    const head = HEADING.exec(line);
    if (head?.[1] && head[2]) {
      flushPara();
      flushList();
      blocks.push({
        type: "heading",
        attrs: { level: head[1].length as AdfHeading["attrs"]["level"] },
        content: inline(head[2]),
      });
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushPara();
      flushList();
      blocks.push({ type: "rule" });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item !== undefined) {
      flushPara();
      const type = bullet ? "bulletList" : "orderedList";
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push(item);
      continue;
    }

    // A non-list line straight after a list item continues that item.
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

export function doc(content: AdfBlock[]): AdfDoc {
  return { type: "doc", version: 1, content: content.length ? content : [paragraph([])] };
}
