import { ReportParseError } from "./types.js";

/** Largest report AuditGate accepts. Forge caps a frontend invoke() request at 500 KB. */
export const MAX_REPORT_BYTES = 350_000;

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, "");
  const nodeBuffer = (globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }).Buffer;
  if (nodeBuffer) return nodeBuffer.from(clean, "base64");
  const binary = atob(clean);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function utf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return undefined;
  }
}

/**
 * Turns uploaded file data into report text. The UI Kit file picker hands over a string whose
 * encoding the docs don't pin down, so this accepts a data URL, bare base64 or plain text.
 */
export function decodeUpload(data: string): string {
  if (typeof data !== "string" || !data.trim()) {
    throw new ReportParseError("The file is empty.");
  }

  let textValue: string | undefined;
  const dataUrl = /^data:[^,]*?(;base64)?,(.*)$/s.exec(data);
  if (dataUrl) {
    textValue = dataUrl[1]
      ? utf8(base64ToBytes(dataUrl[2] ?? ""))
      : decodeURIComponent(dataUrl[2] ?? "");
  } else {
    const trimmed = data.trim();
    const looksBase64 =
      /^[A-Za-z0-9+/\s]+={0,2}$/.test(trimmed) && trimmed.replace(/\s/g, "").length % 4 === 0;
    const decoded = looksBase64 ? utf8(base64ToBytes(trimmed)) : undefined;
    // Only trust a base64 reading if it produces something a report could start with.
    textValue = decoded && /^\s*[{#[]/.test(decoded) ? decoded : data;
  }

  if (textValue === undefined) {
    throw new ReportParseError(
      "The file isn't UTF-8 text. Upload the JSON or Markdown file, not a PDF or archive.",
    );
  }
  if (new TextEncoder().encode(textValue).length > MAX_REPORT_BYTES) {
    throw new ReportParseError(
      `The report is larger than ${Math.round(MAX_REPORT_BYTES / 1000)} KB. Split it, or for Slither filter out dependencies with --filter-paths.`,
    );
  }
  return textValue;
}
