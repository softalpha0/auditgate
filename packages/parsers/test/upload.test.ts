import { describe, expect, it } from "vitest";
import { MAX_REPORT_BYTES, decodeUpload, detectFormat } from "../src/index.js";
import { report } from "./fixtures.js";

const md = report("vault-v2-audit.md");
const base64 = Buffer.from(md, "utf8").toString("base64");

describe("decodeUpload", () => {
  it("decodes a base64 data URL", () => {
    expect(decodeUpload(`data:text/markdown;base64,${base64}`)).toBe(md);
  });

  it("decodes bare base64", () => {
    expect(decodeUpload(base64)).toBe(md);
  });

  it("decodes a URL-encoded data URL", () => {
    expect(decodeUpload(`data:text/plain,${encodeURIComponent("# Title")}`)).toBe("# Title");
  });

  it("passes plain text through", () => {
    expect(decodeUpload(md)).toBe(md);
    const json = report("aderyn.json");
    expect(detectFormat(decodeUpload(json))).toBe("aderyn");
  });

  it("does not mistake a short word for base64", () => {
    expect(decodeUpload("abcd")).toBe("abcd");
  });

  it("strips a byte-order mark", () => {
    const withBom = Buffer.from(`\uFEFF${md}`, "utf8").toString("base64");
    expect(decodeUpload(withBom)).toBe(md);
  });

  it("rejects empty, binary and oversized files", () => {
    expect(() => decodeUpload("")).toThrow(/empty/);
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x00, 0x80]).toString("base64");
    expect(() => decodeUpload(`data:application/pdf;base64,${pdf}`)).toThrow(/UTF-8/);
    expect(() => decodeUpload("#".repeat(MAX_REPORT_BYTES + 1))).toThrow(/larger than/);
  });
});
