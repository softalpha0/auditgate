import { describe, expect, it } from "vitest";
import { inline, markdownToBlocks } from "../src/index.js";

describe("inline", () => {
  it("handles code, bold, italics and links", () => {
    expect(
      inline("Call `setPrice` as **anyone**, see [docs](https://x.io/a) or *note* _this_"),
    ).toEqual([
      { type: "text", text: "Call " },
      { type: "text", text: "setPrice", marks: [{ type: "code" }] },
      { type: "text", text: " as " },
      { type: "text", text: "anyone", marks: [{ type: "strong" }] },
      { type: "text", text: ", see " },
      { type: "text", text: "docs", marks: [{ type: "link", attrs: { href: "https://x.io/a" } }] },
      { type: "text", text: " or " },
      { type: "text", text: "note", marks: [{ type: "em" }] },
      { type: "text", text: " " },
      { type: "text", text: "this", marks: [{ type: "em" }] },
    ]);
  });

  it("keeps relative links and stray markers as text", () => {
    expect(inline("see [test](../a.sol) and 2 * 3")).toEqual([
      { type: "text", text: "see " },
      { type: "text", text: "[test](../a.sol)" },
      { type: "text", text: " and 2 * 3" },
    ]);
  });

  it("never emits empty text nodes", () => {
    expect(inline("")).toEqual([]);
    expect(inline("`a`")).toEqual([{ type: "text", text: "a", marks: [{ type: "code" }] }]);
  });
});

describe("markdownToBlocks", () => {
  it("converts paragraphs, headings, lists, rules and code", () => {
    const md = [
      "First line",
      "same paragraph.",
      "",
      "## Steps",
      "- one",
      "- two",
      "  continued",
      "1. first",
      "2. second",
      "",
      "---",
      "```solidity",
      "function f() external {}",
      "```",
    ].join("\n");
    expect(markdownToBlocks(md)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First line same paragraph." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Steps" }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "two continued" }] }],
          },
        ],
      },
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "second" }] }],
          },
        ],
      },
      { type: "rule" },
      {
        type: "codeBlock",
        attrs: { language: "solidity" },
        content: [{ type: "text", text: "function f() external {}" }],
      },
    ]);
  });

  it("keeps Slither's tab-indented detail lines readable", () => {
    const blocks = markdownToBlocks(
      "Reentrancy in X:\n\tExternal calls:\n\t- call() (src/A.sol#39)",
    );
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "bulletList"]);
  });

  it("handles an unclosed code fence and CRLF", () => {
    expect(markdownToBlocks("```\r\ncode\r\n")).toEqual([
      { type: "codeBlock", content: [{ type: "text", text: "code" }] },
    ]);
  });
});
