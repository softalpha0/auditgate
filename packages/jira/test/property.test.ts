import type { Finding } from "@auditgate/core";
import { parseReport, toNewFindings } from "@auditgate/parsers";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson, issueProperty, signProperty, verifyProperty } from "../src/property.js";

const md = readFileSync(
  new URL("../../../demo/reports/vault-v2-audit.md", import.meta.url),
  "utf8",
);
const findings = toNewFindings(parseReport(md).findings, "a1b2c3");
const byId = (id: string) => findings.find((f) => f.externalId === id) as Finding;
const audit = {
  id: "a1b2c3",
  name: "Vault v2 audit",
  repo: { workspace: "auditgate-demo", slug: "vault-v2" },
  auditedCommit: "3f1c2a9e0b7d4c6a8e5f1b2c3d4e5f6a7b8c9d0e",
  auditedFiles: ["src/TokenVault.sol"],
  createdAt: "2026-11-02T09:00:00.000Z",
};
const SECRET = "test-secret-0123456789abcdef";

describe("issue property signing", () => {
  it("lists every file a finding points at, once", () => {
    expect(issueProperty(byId("L-01"), audit).files).toEqual([
      "src/TokenVault.sol",
      "src/RewardsDistributor.sol",
    ]);
  });

  it("blocks on unreviewed changes unless the audit turned it off", () => {
    expect(issueProperty(byId("C-01"), audit).audit.blockOnUnreviewedChanges).toBe(true);
    const off = { ...audit, settings: { blockOnUnreviewedChanges: false } };
    expect(issueProperty(byId("C-01"), off).audit.blockOnUnreviewedChanges).toBe(false);
  });

  it("accepts a property signed with the same secret", () => {
    const signed = signProperty(issueProperty(byId("C-01"), audit), SECRET);
    expect(signed.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyProperty(signed, SECRET)).toBe(true);
  });

  it("survives a round trip through JSON with keys in another order", () => {
    const signed = signProperty(issueProperty(byId("H-01"), audit), SECRET);
    const reordered = JSON.parse(
      JSON.stringify(Object.fromEntries(Object.entries(signed).reverse())),
    );
    expect(verifyProperty(reordered, SECRET)).toBe(true);
  });

  it("rejects a property someone edited to open the gate", () => {
    const signed = signProperty(issueProperty(byId("C-01"), audit), SECRET);
    expect(verifyProperty({ ...signed, status: "AcceptedRisk" }, SECRET)).toBe(false);
    expect(verifyProperty({ ...signed, severity: "Low" }, SECRET)).toBe(false);
    expect(
      verifyProperty({ ...signed, audit: { ...signed.audit, auditedFiles: [] } }, SECRET),
    ).toBe(false);
  });

  it("rejects unsigned properties, wrong secrets and malformed signatures", () => {
    const property = issueProperty(byId("C-01"), audit);
    expect(verifyProperty(property, SECRET)).toBe(false);
    expect(verifyProperty(signProperty(property, "other-secret"), SECRET)).toBe(false);
    expect(verifyProperty({ ...property, sig: "not-hex" }, SECRET)).toBe(false);
  });

  it("serialises keys in a stable order at every level", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"x":2,"y":1}]},"b":1}',
    );
  });
});
